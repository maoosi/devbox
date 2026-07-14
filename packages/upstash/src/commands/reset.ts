import { parseArgs } from 'node:util';
import { Box } from '@upstash/box';
import { loadConfig } from '../config';
import { findBoxByName, listProjectBoxes } from '../boxes';
import { workspaceId } from '../names';

export default async function reset(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { yes: { type: 'boolean', default: false } },
  });

  const cfg = await loadConfig();
  const boxes = await listProjectBoxes(cfg);
  const baseBox = await findBoxByName(cfg.baseBoxName);
  const snapshots = baseBox
    ? (await baseBox.listSnapshots()).filter((s) => s.status !== 'deleted')
    : [];

  if (boxes.length === 0 && snapshots.length === 0) {
    console.log(`Nothing to reset for project '${cfg.name}'.`);
    return 0;
  }

  console.log(`This will permanently delete for project '${cfg.name}':`);
  for (const s of snapshots) console.log(`  snapshot   ${s.name} (${s.id})`);
  for (const b of boxes) console.log(`  box        ${workspaceId(cfg.name, b.name!)} (${b.id})`);
  if (!baseBox && boxes.length > 0) {
    console.log('  (base box already gone — its snapshots cannot be enumerated)');
  }

  if (!values.yes) {
    if (!process.stdin.isTTY) {
      console.error(`Refusing to reset without confirmation — re-run with --yes.`);
      return 1;
    }
    const answer = prompt(`Type "yes" to confirm:`);
    if (answer !== 'yes') {
      console.log('Aborted.');
      return 1;
    }
  }

  // Per-id deletes only — the static Box.deleteSnapshots() without ids would
  // wipe every snapshot on the account, not just this project's.
  for (const s of snapshots) {
    console.log(`Deleting snapshot ${s.id}...`);
    await baseBox!.deleteSnapshot(s.id);
  }
  if (boxes.length > 0) {
    console.log(`Deleting ${boxes.length} box(es)...`);
    await Box.delete({ boxIds: boxes.map((b) => b.id) });
  }

  console.log(`Project '${cfg.name}' reset. Run 'devbox init' to start again.`);
  return 0;
}
