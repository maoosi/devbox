import { parseArgs } from 'node:util';
import { Box } from '@upstash/box';
import { loadConfig } from '../config';
import { ensureRunning, findBaseSnapshot, findBoxByName, getBranch } from '../boxes';
import { NAME_RE, workspaceBoxName } from '../names';
import { printBoxInfo } from '../print';
import { runScript, shellQuote } from '@devbox/core';
import { BoxExecutor } from '../executor';

export default async function create(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { branch: { type: 'string' } },
    allowPositionals: true,
  });
  const workspace = positionals[0];
  if (!workspace) {
    console.error('Usage: devbox create <workspace> [--branch <branch>]');
    return 1;
  }
  if (!NAME_RE.test(workspace)) {
    console.error(`Invalid workspace name '${workspace}' (allowed: ${NAME_RE})`);
    return 1;
  }

  const cfg = await loadConfig();
  const boxName = workspaceBoxName(cfg.name, workspace);

  // Idempotent: an existing workspace is reported, never recreated or re-checked-out.
  const existing = await findBoxByName(boxName);
  if (existing) {
    const [{ status }, urls] = await Promise.all([
      existing.getStatus(),
      existing.listPublicURLs().catch(() => ({ publicURLs: [] })),
    ]);
    const running = status === 'running' || status === 'idle';
    const branch = running ? await getBranch(existing, cfg.workdir) : undefined;
    printBoxInfo(existing, {
      title: `Workspace '${workspace}' already exists.`,
      status,
      branch: branch ?? '-',
      urls: urls.publicURLs,
    });
    return 0;
  }

  const found = await findBaseSnapshot(cfg);
  if (!found?.snapshot) {
    console.error(
      found
        ? `No base snapshot — run 'devbox snapshot' first.`
        : `No base box '${cfg.baseBoxName}' — run 'devbox init' first.`,
    );
    return 1;
  }

  console.log(`Creating workspace '${workspace}' from base snapshot...`);
  const box = await Box.fromSnapshot(found.snapshot.id, {
    runtime: 'node',
    name: boxName,
    keepAlive: false,
    size: 'medium',
  });
  await ensureRunning(box);

  const branch = values.branch;
  if (branch) {
    console.log(`Checking out branch '${branch}'...`);
    await runScript(
      new BoxExecutor(box),
      [
        `exec 2>&1`,
        `cd ${shellQuote(cfg.workdir)}`,
        `git fetch origin ${shellQuote(branch)}`,
        `git checkout -B ${shellQuote(branch)} ${shellQuote(`origin/${branch}`)}`,
      ].join('\n'),
    );
  }

  printBoxInfo(box, {
    title: `Workspace '${workspace}' is ready.`,
    status: 'running',
    branch: branch ?? cfg.branch,
    urls: [],
  });
  return 0;
}
