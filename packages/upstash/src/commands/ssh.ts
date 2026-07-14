import { loadConfig } from '../config';
import { ensureRunning, requireWorkspaceBox } from '../boxes';
import { interactiveSsh } from '../ssh';

export default async function ssh(argv: string[]): Promise<number> {
  const workspace = argv[0];
  if (!workspace) {
    console.error('Usage: devbox ssh <workspace>');
    return 1;
  }

  const cfg = await loadConfig();
  const box = await requireWorkspaceBox(cfg, workspace);
  await ensureRunning(box);
  return interactiveSsh(box.id);
}
