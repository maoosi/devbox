import { SSH_HOST } from './boxes';

export const sshTarget = (boxId: string) => `${boxId}@${SSH_HOST}`;

export const sshCommand = (boxId: string) => `ssh ${sshTarget(boxId)}`;

export const PASSWORD_HINT = 'Password: your UPSTASH_BOX_API_KEY';

/**
 * Build the argv for an interactive SSH session. Upstash Box only supports
 * password auth (password = the Box API key), so use sshpass when available.
 * accept-new is required — sshpass cannot answer the host-key prompt.
 */
export function buildSshArgv(boxId: string): { argv: string[]; usedSshpass: boolean } {
  const ssh = ['ssh', '-o', 'StrictHostKeyChecking=accept-new', sshTarget(boxId)];
  const apiKey = Bun.env.UPSTASH_BOX_API_KEY;
  if (apiKey && Bun.which('sshpass')) {
    return { argv: ['sshpass', '-p', apiKey, ...ssh], usedSshpass: true };
  }
  return { argv: ssh, usedSshpass: false };
}

/** Spawn an interactive SSH session into the box; returns the exit code. */
export async function interactiveSsh(boxId: string): Promise<number> {
  const { argv, usedSshpass } = buildSshArgv(boxId);
  if (!usedSshpass) {
    console.log(`${PASSWORD_HINT} (tip: install sshpass to skip this prompt)`);
  }
  const proc = Bun.spawn(argv, { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
  return await proc.exited;
}
