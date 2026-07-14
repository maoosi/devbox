import type { Executor } from '../executor';
import type { SetupStatus } from '../types';
import { ensureLine, run, runScript } from '../lib';

/**
 * Disable install/postinstall scripts globally — the cheapest, highest-value
 * supply-chain defense (blocks install-time exfil from postinstall hooks).
 * Per-package opt-out remains available, e.g. `pnpm install --ignore-scripts=false <pkg>`.
 */
export async function setupSupplyChain(exec: Executor): Promise<SetupStatus> {
  const already =
    (await run(exec, `grep -qF ignoreScripts "$HOME/.bunfig.toml" 2>/dev/null`)).exitCode === 0;
  await runScript(
    exec,
    [
      `command -v npm >/dev/null 2>&1 && npm config set ignore-scripts true || true`,
      `command -v pnpm >/dev/null 2>&1 && pnpm config set ignore-scripts true || true`,
    ].join('\n'),
  );
  await ensureLine(exec, '$HOME/.bunfig.toml', 'ignoreScripts', '[install]\nignoreScripts = true');
  return already ? { kind: 'reused' } : { kind: 'installed' };
}
