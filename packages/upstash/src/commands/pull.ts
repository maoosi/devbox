import { parseArgs } from 'node:util';
import { run, shellQuote, type Executor } from '@devbox/core';
import { loadConfig } from '../config';
import { ensureRunning, requireWorkspaceBox } from '../boxes';
import { BoxExecutor } from '../executor';

// Markers isolate the base64 payload from anything else the exec channel
// emits (Run.result merges streams; see executor.ts).
const BEGIN = 'DEVBOX_PATCH_BEGIN';
const END = 'DEVBOX_PATCH_END';

/**
 * Build a git patch of every uncommitted change in the remote workdir —
 * including new files — and return it as text ('' when the tree is clean).
 * Read-only on the box: intent-to-add entries are reset before returning.
 */
export async function fetchPatch(exec: Executor, workdir: string): Promise<string> {
  const script = [
    `exec 2>/dev/null`,
    `set -e`,
    `cd ${shellQuote(workdir)}`,
    // Intent-to-add so untracked files appear in the diff (gitignore is
    // respected); reset afterwards so the box is left exactly as found.
    // `base64 | tr -d '\n'` instead of `-w0` for BSD/GNU portability.
    `git add -A -N`,
    `patch="$(git diff --binary HEAD | base64 | tr -d '\\n')"`,
    `git reset -q`,
    `printf '%s%s%s' '${BEGIN}' "$patch" '${END}'`,
  ].join('\n');
  const r = await run(exec, script);
  const m = r.output.match(new RegExp(`${BEGIN}(.*)${END}`, 's'));
  if (r.exitCode !== 0 || !m) {
    throw new Error(`Failed to read changes from the workspace (exit ${r.exitCode}).`);
  }
  return m[1] ? Buffer.from(m[1], 'base64').toString('utf8') : '';
}

function gitApply(patch: string, repoRoot: string, args: string[]): number {
  const r = Bun.spawnSync(['git', 'apply', ...args], {
    cwd: repoRoot,
    stdin: Buffer.from(patch),
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return r.exitCode ?? 1;
}

/**
 * Apply a patch to the local repo. Always prints the diffstat first;
 * `statOnly` stops there. `--3way` falls back to a three-way merge when the
 * patch doesn't apply cleanly, leaving standard conflict markers.
 */
export function applyPatchLocally(
  patch: string,
  opts: { repoRoot: string; statOnly?: boolean },
): number {
  gitApply(patch, opts.repoRoot, ['--stat', '--summary']);
  if (opts.statOnly) return 0;
  return gitApply(patch, opts.repoRoot, ['--3way']);
}

export default async function pull(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { stat: { type: 'boolean' }, force: { type: 'boolean' } },
    allowPositionals: true,
  });
  const workspace = positionals[0];
  if (!workspace) {
    console.error('Usage: devbox pull <workspace> [--stat] [--force]');
    return 1;
  }

  const cfg = await loadConfig();

  // Fail fast on the local side before touching the network. The patch paths
  // are repo-root-relative, so we apply from the local checkout's toplevel.
  const top = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (top.exitCode !== 0) {
    console.error('Not inside a git repository — run from your local checkout.');
    return 1;
  }
  const repoRoot = top.stdout.toString().trim();
  const originRun = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const origin = originRun.exitCode === 0 ? originRun.stdout.toString().trim() : '';
  const slug = `${cfg.owner}/${cfg.repo}`;
  if (!origin.toLowerCase().includes(slug.toLowerCase()) && !values.force) {
    console.error(
      `This checkout's origin (${origin || 'none'}) doesn't look like ${slug}.\n` +
        `Run from the project checkout, or pass --force to apply here anyway.`,
    );
    return 1;
  }

  const box = await requireWorkspaceBox(cfg, workspace);
  await ensureRunning(box, { log: console.error });

  console.log(`Reading uncommitted changes from '${workspace}'...`);
  const patch = await fetchPatch(new BoxExecutor(box), cfg.workdir);
  if (!patch.trim()) {
    console.log('Workspace is clean — nothing to pull.');
    return 0;
  }

  const code = applyPatchLocally(patch, { repoRoot, statOnly: values.stat === true });
  if (values.stat) {
    console.log(`\nPreview only (--stat). Run 'devbox pull ${workspace}' to apply.`);
    return 0;
  }
  if (code !== 0) {
    console.error(
      '\nPatch did not apply cleanly — resolve the conflicts above, or commit/stash local changes and retry.',
    );
    return code;
  }
  console.log(`\nApplied. Review with 'git status' / 'git diff', then commit locally.`);
  return 0;
}
