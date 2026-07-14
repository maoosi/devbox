import type { Executor } from '../executor';
import type { SetupStatus } from '../types';
import { run, runScript } from '../lib';

/**
 * Install Vite+ (unified JS toolchain). The upstream installer appends
 * `. "$HOME/.vite-plus/env"` to ~/.bashrc on every run, so skip when the
 * install marker is already there.
 */
export async function setupVitePlus(exec: Executor): Promise<SetupStatus> {
  const has = (await run(exec, `test -e "$HOME/.vite-plus"`)).exitCode === 0;
  if (has) return { kind: 'reused', note: '~/.vite-plus already present' };
  await runScript(exec, `curl -fsSL https://vite.plus | bash`);
  return { kind: 'installed' };
}
