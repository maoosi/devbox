import type { Executor } from '../executor';
import type { SetupStatus } from '../types';
import { run, runScript, upsertEnv } from '../lib';

/**
 * Install the Infisical CLI and inject INFISICAL_TOKEN so the CLI is ready on
 * the target (`infisical run`, `infisical secrets`, ...). Token is optional so
 * callers that validate tokens against the freshly-installed CLI (ubuntu's
 * prompt flow) can install first and `upsertEnv` after.
 */
export async function setupInfisical(exec: Executor, token?: string): Promise<SetupStatus> {
  const has = (await run(exec, `command -v infisical >/dev/null 2>&1`)).exitCode === 0;
  if (!has) {
    // umask 022: the ubuntu installer runs under umask 077; without this the
    // apt keyring/list files land unreadable for _apt and apt exits 100.
    await runScript(
      exec,
      `umask 022\ncurl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash\nsudo apt-get install -y -qq infisical`,
    );
  }
  if (token !== undefined) await upsertEnv(exec, 'INFISICAL_TOKEN', token);
  return has ? { kind: 'reused', note: 'CLI already installed' } : { kind: 'installed' };
}
