import { Box } from '@upstash/box';
import { loadConfig } from '../config';
import { getBranch, requireWorkspaceBox } from '../boxes';
import { printBoxInfo } from '../print';

export default async function info(argv: string[]): Promise<number> {
  const workspace = argv[0];
  if (!workspace) {
    console.error('Usage: devbox info <workspace>');
    return 1;
  }

  const cfg = await loadConfig();
  const box = await requireWorkspaceBox(cfg, workspace);

  const [{ status }, data, urls] = await Promise.all([
    box.getStatus(),
    Box.list().then((all) => all.find((b) => b.id === box.id)),
    box.listPublicURLs().catch(() => ({ publicURLs: [] })),
  ]);

  // Never resume a box just to read its branch.
  const running = status === 'running' || status === 'idle';
  const branch = running ? await getBranch(box, cfg.workdir) : undefined;

  printBoxInfo(box, {
    title: `Workspace '${workspace}'`,
    status,
    branch: branch ?? (running ? '-' : `- (${status})`),
    urls: urls.publicURLs,
    createdAt: data?.created_at,
  });
  return 0;
}
