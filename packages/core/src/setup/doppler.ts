import type { Executor } from '../executor';
import type { SetupStatus } from '../types';
import { run, runScript, upsertEnv } from '../lib';

/**
 * Install the Doppler CLI and inject DOPPLER_TOKEN so the CLI is ready on the
 * target (`doppler run`, `doppler secrets`, ...). Token is optional so callers
 * that validate tokens against the freshly-installed CLI (ubuntu's prompt
 * flow) can install first and `upsertEnv` after.
 */
export async function setupDoppler(exec: Executor, token?: string): Promise<SetupStatus> {
  const has = (await run(exec, `command -v doppler >/dev/null 2>&1`)).exitCode === 0;
  if (!has) {
    // umask 022: the ubuntu installer runs under umask 077; without this the
    // apt keyring/list files land unreadable for _apt and apt exits 100.
    await runScript(
      exec,
      `umask 022\ncurl -sLf --retry 3 'https://cli.doppler.com/install.sh' | sudo sh`,
    );
  }
  if (token !== undefined) await upsertEnv(exec, 'DOPPLER_TOKEN', token);
  return has ? { kind: 'reused', note: 'CLI already installed' } : { kind: 'installed' };
}
