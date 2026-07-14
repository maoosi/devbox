import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { ensureRunning, findBaseSnapshot } from '../boxes';
import { formatBytes } from '../print';

export default async function snapshot(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { force: { type: 'boolean', default: false } },
  });

  const cfg = await loadConfig();
  const found = await findBaseSnapshot(cfg);
  if (!found) {
    console.error(`No base box '${cfg.baseBoxName}' — run 'devbox init' first.`);
    return 1;
  }
  const { baseBox, snapshot: existing } = found;

  if (existing) {
    if (!values.force) {
      console.error(
        `Base snapshot already exists (${existing.id}). Re-run with --force to replace it.`,
      );
      return 1;
    }
    console.log(`Deleting existing snapshot ${existing.id}...`);
    await baseBox.deleteSnapshot(existing.id);
  }

  await ensureRunning(baseBox);
  console.log('Creating base snapshot (this can take a few minutes)...');
  try {
    const snap = await baseBox.snapshot({ name: cfg.snapshotName });
    console.log(`Snapshot ready: ${snap.id} (${formatBytes(snap.size_bytes)})`);
  } finally {
    // Pause even when the snapshot fails — never leave the base box billing idle.
    try {
      await baseBox.pause();
      console.log('Base box paused.');
    } catch {
      console.log('Could not pause base box — it will auto-pause when idle (keepAlive: false).');
    }
  }

  console.log('Create workspaces with `devbox create <name>`.');
  return 0;
}
