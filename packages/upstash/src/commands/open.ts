import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { SSH_HOST, ensureRunning, requireWorkspaceBox } from '../boxes';
import { PASSWORD_HINT, sshTarget } from '../ssh';

export default async function open(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { editor: { type: 'string' } },
    allowPositionals: true,
  });
  const workspace = positionals[0];
  if (!workspace) {
    console.error('Usage: devbox open <workspace> [--editor zed|code]');
    return 1;
  }

  const cfg = await loadConfig();
  const editor = values.editor ?? cfg.editor;
  if (editor !== 'zed' && editor !== 'code') {
    console.error(`Unsupported editor '${editor}' — supported: zed, code`);
    return 1;
  }

  const box = await requireWorkspaceBox(cfg, workspace);
  await ensureRunning(box);

  const path = `/workspace/${cfg.workdir}`;
  const cmd =
    editor === 'zed'
      ? ['zed', `ssh://${sshTarget(box.id)}${path}`]
      : ['code', '--remote', `ssh-remote+${box.id}@${SSH_HOST}`, path];

  if (!Bun.which(cmd[0]!)) {
    console.error(`'${cmd[0]}' CLI not found on PATH. Run manually:\n  ${cmd.join(' ')}`);
    return 1;
  }

  console.log(`Opening in ${editor}: ${cmd.join(' ')}`);
  console.log(`(${PASSWORD_HINT})`);
  const proc = Bun.spawn(cmd, { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
  return await proc.exited;
}
