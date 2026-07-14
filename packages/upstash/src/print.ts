import type { Box } from '@upstash/box';
import { PASSWORD_HINT, sshCommand } from './ssh';

type PublicURL = { url: string; port: number };

export function formatAge(createdAt: number | undefined): string {
  if (!createdAt) return '-';
  // created_at may be seconds or milliseconds depending on the API.
  const ms = createdAt > 1e12 ? createdAt : createdAt * 1000;
  const diff = Date.now() - ms;
  if (diff < 0) return 'now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

export function printBoxInfo(
  box: Box,
  opts: {
    title: string;
    status?: string;
    branch?: string;
    urls?: PublicURL[];
    createdAt?: number;
  },
) {
  const rows: [string, string][] = [['box', box.id]];
  if (opts.status) rows.push(['status', opts.status]);
  if (opts.branch !== undefined) rows.push(['branch', opts.branch]);
  rows.push(['ssh', sshCommand(box.id)]);
  if (opts.urls) {
    if (opts.urls.length === 0) rows.push(['urls', '- (use devbox url <ws> <port>)']);
    for (const u of opts.urls) rows.push([`url :${u.port}`, u.url]);
  }
  if (opts.createdAt) rows.push(['age', formatAge(opts.createdAt)]);

  const pad = Math.max(...rows.map(([k]) => k.length));
  console.log(`\n${opts.title}`);
  for (const [k, v] of rows) console.log(`  ${k.padEnd(pad)}  ${v}`);
  console.log(`  ${''.padEnd(pad)}  (${PASSWORD_HINT})\n`);
}
