import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ExecResult, Executor } from '@devbox/core';
import { applyPatchLocally, fetchPatch } from '../src/commands/pull';

// The whole pull pipeline is exercised locally: a "box" repo on disk stands in
// for the remote workdir (fetchPatch only needs an Executor), and a clone of
// it stands in for the user's local checkout.
class BashExecutor implements Executor {
  async exec(script: string): Promise<ExecResult> {
    const proc = Bun.spawn(['bash', '-c', script], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { exitCode, output: stdout + stderr };
  }
}

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr.toString()}`);
  }
  return r.stdout.toString();
}

const exec = new BashExecutor();
let root: string;
let boxRepo: string;
let localRepo: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'devbox-pull-'));
  boxRepo = path.join(root, 'box');
  localRepo = path.join(root, 'local');
  await fs.mkdir(boxRepo);
  git(boxRepo, 'init', '-q');
  git(boxRepo, 'config', 'user.email', 'test@example.com');
  git(boxRepo, 'config', 'user.name', 'test');
  await fs.writeFile(path.join(boxRepo, 'app.txt'), 'line1\nline2\n');
  await fs.writeFile(path.join(boxRepo, '.gitignore'), 'ignored.txt\n');
  git(boxRepo, 'add', '-A');
  git(boxRepo, 'commit', '-qm', 'init');
  git(root, 'clone', '-q', boxRepo, localRepo);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('fetchPatch', () => {
  test('returns empty string for a clean tree', async () => {
    expect(await fetchPatch(exec, boxRepo)).toBe('');
  });

  test('captures modifications and new files, respects gitignore, leaves the box untouched', async () => {
    await fs.writeFile(path.join(boxRepo, 'app.txt'), 'line1\nCHANGED\n');
    await fs.writeFile(path.join(boxRepo, 'new-file.txt'), 'brand new\n');
    await fs.writeFile(path.join(boxRepo, 'ignored.txt'), 'never leaves\n');

    const patch = await fetchPatch(exec, boxRepo);
    expect(patch).toContain('app.txt');
    expect(patch).toContain('new-file.txt');
    expect(patch).toContain('CHANGED');
    expect(patch).not.toContain('ignored.txt');

    // Intent-to-add entries were reset: new file is untracked again, nothing staged.
    const status = git(boxRepo, 'status', '--porcelain');
    expect(status).toContain('?? new-file.txt');
    expect(status).not.toMatch(/^A/m);
  });

  test('throws on a non-repo workdir', async () => {
    await fs.mkdir(path.join(root, 'not-a-repo'));
    expect(fetchPatch(exec, path.join(root, 'not-a-repo'))).rejects.toThrow(
      /Failed to read changes/,
    );
  });
});

describe('applyPatchLocally', () => {
  test('applies modifications + new files into the local checkout', async () => {
    await fs.writeFile(path.join(boxRepo, 'app.txt'), 'line1\nCHANGED\n');
    await fs.writeFile(path.join(boxRepo, 'new-file.txt'), 'brand new\n');
    const patch = await fetchPatch(exec, boxRepo);

    const code = applyPatchLocally(patch, { repoRoot: localRepo });
    expect(code).toBe(0);
    expect(await fs.readFile(path.join(localRepo, 'app.txt'), 'utf8')).toBe('line1\nCHANGED\n');
    expect(await fs.readFile(path.join(localRepo, 'new-file.txt'), 'utf8')).toBe('brand new\n');
  });

  test('statOnly previews without touching the working tree', async () => {
    await fs.writeFile(path.join(boxRepo, 'app.txt'), 'line1\nCHANGED\n');
    const patch = await fetchPatch(exec, boxRepo);

    const code = applyPatchLocally(patch, { repoRoot: localRepo, statOnly: true });
    expect(code).toBe(0);
    expect(await fs.readFile(path.join(localRepo, 'app.txt'), 'utf8')).toBe('line1\nline2\n');
  });

  test('handles binary changes (--binary diff round-trip)', async () => {
    const bytes = Buffer.from([0, 1, 2, 253, 254, 255]);
    await fs.writeFile(path.join(boxRepo, 'blob.bin'), bytes);
    const patch = await fetchPatch(exec, boxRepo);

    const code = applyPatchLocally(patch, { repoRoot: localRepo });
    expect(code).toBe(0);
    expect(Buffer.from(await fs.readFile(path.join(localRepo, 'blob.bin')))).toEqual(bytes);
  });

  test('refuses to clobber uncommitted local edits (file left untouched)', async () => {
    await fs.writeFile(path.join(boxRepo, 'app.txt'), 'line1\nBOX EDIT\n');
    const patch = await fetchPatch(exec, boxRepo);
    // Dirty working tree locally: --3way requires tree == index, so apply
    // fails cleanly instead of merging into unsaved work.
    await fs.writeFile(path.join(localRepo, 'app.txt'), 'line1\nLOCAL EDIT\n');

    const code = applyPatchLocally(patch, { repoRoot: localRepo });
    expect(code).not.toBe(0);
    expect(await fs.readFile(path.join(localRepo, 'app.txt'), 'utf8')).toBe('line1\nLOCAL EDIT\n');
  });

  test('falls back to 3-way merge on committed local drift (conflict markers, not silent clobber)', async () => {
    // Same line edited differently on both sides, local edit committed →
    // conflict markers in the working tree.
    await fs.writeFile(path.join(boxRepo, 'app.txt'), 'line1\nBOX EDIT\n');
    const patch = await fetchPatch(exec, boxRepo);
    await fs.writeFile(path.join(localRepo, 'app.txt'), 'line1\nLOCAL EDIT\n');
    git(localRepo, 'config', 'user.email', 'test@example.com');
    git(localRepo, 'config', 'user.name', 'test');
    git(localRepo, 'commit', '-aqm', 'local drift');

    const code = applyPatchLocally(patch, { repoRoot: localRepo });
    expect(code).not.toBe(0);
    const content = await fs.readFile(path.join(localRepo, 'app.txt'), 'utf8');
    expect(content).toContain('<<<<<<<');
    expect(content).toContain('BOX EDIT');
    expect(content).toContain('LOCAL EDIT');
  });
});
