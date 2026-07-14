import type { Executor } from '../executor';
import type { Ctx, SetupStatus } from '../types';
import { fileExists, folderExists, run, shellQuote, writeFile } from '../lib';
import { preMergeCommitHook, prePushHook, shouldInstallHook } from '../content/hooks';

/**
 * Install pre-push + pre-merge-commit hooks reflecting the devbox's git write
 * policy (block branch deletion / direct pushes and merges to the default
 * branch). Skipped in read-only mode (the read-only PAT scope + agent deny
 * rules cover it) and when the policy is fully permissive.
 */
export async function setupGitSafety(exec: Executor, ctx: Ctx): Promise<SetupStatus> {
  if (!shouldInstallHook(ctx.gitMode, ctx.gitWritePolicy)) {
    const why = ctx.gitMode === 'write' ? 'permissive policy' : 'read-only mode';
    return { kind: 'reused', note: `no hooks needed (${why})` };
  }
  const hooksDir = `${ctx.workdir}/.git/hooks`;
  if (!(await folderExists(exec, hooksDir))) {
    return { kind: 'reused', note: 'no .git/hooks directory; skipped' };
  }
  const prePushPath = `${hooksDir}/pre-push`;
  const preMergePath = `${hooksDir}/pre-merge-commit`;
  const existed = await fileExists(exec, prePushPath);
  // Always (re)write — policy may have changed across runs and the hooks are
  // managed artifacts.
  await writeFile(exec, prePushPath, prePushHook(ctx.gitWritePolicy));
  await writeFile(exec, preMergePath, preMergeCommitHook(ctx.gitWritePolicy));
  await run(exec, `chmod +x ${shellQuote(prePushPath)} ${shellQuote(preMergePath)}`);
  return existed ? { kind: 'mixed', note: 'hooks rewritten' } : { kind: 'installed' };
}
