import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ExecResult, Executor } from '../src/executor';
import { ensureLine, fileExists, folderExists, shellQuote, upsertEnv, writeFile } from '../src/lib';

/** Real-bash executor with HOME pointed at a throwaway dir. */
class BashExecutor implements Executor {
  constructor(private home: string) {}
  async exec(script: string): Promise<ExecResult> {
    const proc = Bun.spawn(['bash', '-c', script], {
      env: { ...process.env, HOME: this.home },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { exitCode, output: stdout + stderr };
  }
}

let home: string;
let exec: BashExecutor;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'devbox-core-lib-'));
  exec = new BashExecutor(home);
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

const envFile = () => path.join(home, '.config', 'devbox', 'env');

describe('shellQuote', () => {
  test('round-trips tricky values through bash', async () => {
    for (const value of [`plain`, `has spaces`, `single'quote`, `$HOME \`cmd\` "dq"`, `a;b|c&d`]) {
      const r = await exec.exec(`printf %s ${shellQuote(value)}`);
      expect(r.exitCode).toBe(0);
      expect(r.output).toBe(value);
    }
  });
});

describe('writeFile', () => {
  test('writes exact content, creating parent dirs', async () => {
    const content = 'line1\nsingle\'quote "dq" $HOME `cmd`\n';
    await writeFile(exec, '$HOME/deep/nested/file.txt', content);
    expect(await fs.readFile(path.join(home, 'deep', 'nested', 'file.txt'), 'utf8')).toBe(content);
  });
});

describe('upsertEnv', () => {
  test('appends export lines and replaces on re-run', async () => {
    await upsertEnv(exec, 'GH_TOKEN', 'first');
    await upsertEnv(exec, 'OTHER', 'keep');
    await upsertEnv(exec, 'GH_TOKEN', "sec'ond");
    const content = await fs.readFile(envFile(), 'utf8');
    expect(content).toContain(`export OTHER='keep'`);
    expect(content).toContain(`export GH_TOKEN='sec'\\''ond'`);
    expect(content).not.toContain('first');
    // Sourcing the file yields the latest value.
    const r = await exec.exec(`. "$HOME/.config/devbox/env" && printf %s "$GH_TOKEN"`);
    expect(r.output).toBe("sec'ond");
  });
});

describe('ensureLine', () => {
  test('appends once, keyed by marker', async () => {
    await ensureLine(exec, '$HOME/.bashrc', 'devbox/env', '. env # devbox/env');
    await ensureLine(exec, '$HOME/.bashrc', 'devbox/env', '. env # devbox/env');
    const content = await fs.readFile(path.join(home, '.bashrc'), 'utf8');
    expect(content.split('devbox/env').length - 1).toBe(1);
  });
});

describe('fileExists / folderExists', () => {
  test('reflect the filesystem', async () => {
    expect(await fileExists(exec, '$HOME/nope.txt')).toBe(false);
    expect(await folderExists(exec, home)).toBe(true);
    await writeFile(exec, '$HOME/nope.txt', 'x');
    expect(await fileExists(exec, '$HOME/nope.txt')).toBe(true);
  });
});
