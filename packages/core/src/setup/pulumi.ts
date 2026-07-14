import type { Executor } from '../executor';
import type { SetupStatus } from '../types';
import { ensureLine, run, runScript } from '../lib';

/**
 * Install the Pulumi CLI and put it on PATH for interactive shells
 * (non-interactive execs get it via ENV_PREAMBLE in lib.ts).
 */
export async function setupPulumi(exec: Executor): Promise<SetupStatus> {
  const hasPulumi = (await run(exec, `test -x "$HOME/.pulumi/bin/pulumi"`)).exitCode === 0;
  if (!hasPulumi) {
    await runScript(exec, `curl -fsSL https://get.pulumi.com | sh`);
  }
  await ensureLine(
    exec,
    '$HOME/.config/devbox/env',
    'pulumi/bin',
    'export PATH="$HOME/.pulumi/bin:$PATH" # pulumi/bin',
  );
  return hasPulumi ? { kind: 'reused' } : { kind: 'installed' };
}
