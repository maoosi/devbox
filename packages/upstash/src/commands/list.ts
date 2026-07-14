import { Box } from '@upstash/box';
import { loadConfig } from '../config';
import { getBranch, listProjectBoxes } from '../boxes';
import { workspaceId } from '../names';
import { formatAge } from '../print';

export default async function list(_argv: string[]): Promise<number> {
  const cfg = await loadConfig();
  const boxes = await listProjectBoxes(cfg);

  if (boxes.length === 0) {
    console.log(`No boxes for project '${cfg.name}'. Run 'devbox init' to get started.`);
    return 0;
  }

  // Branch is only probed on boxes that can already exec; anything else shows '-'.
  const branches = await Promise.all(
    boxes.map(async (b) => {
      if (b.status !== 'running' && b.status !== 'idle') return '-';
      try {
        const box = await Box.get(b.id);
        return (await getBranch(box, cfg.workdir)) ?? '-';
      } catch {
        return '-';
      }
    }),
  );

  const rows = boxes.map((b, i) => [
    workspaceId(cfg.name, b.name!),
    b.status,
    branches[i]!,
    formatAge(b.created_at),
  ]);
  const header = ['NAME', 'STATUS', 'BRANCH', 'AGE'];
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c]!.length)));
  const line = (r: string[]) => r.map((v, c) => v.padEnd(widths[c]!)).join('  ');

  console.log(line(header));
  for (const r of rows) console.log(line(r));
  return 0;
}
