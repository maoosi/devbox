import { parseArgs } from 'node:util';
import { Box } from '@upstash/box';
import { loadConfig } from '../config';
import { ensureRunning, findBoxByName } from '../boxes';
import { provisionBox } from '../provision';
import { printBoxInfo } from '../print';
import { interactiveSsh } from '../ssh';

export default async function init(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { 'no-ssh': { type: 'boolean', default: false } },
  });

  const cfg = await loadConfig();

  let box = await findBoxByName(cfg.baseBoxName);
  if (box) {
    console.log(`Found existing base box: ${box.id}`);
    await ensureRunning(box);
  } else {
    console.log(`Creating base box: ${cfg.baseBoxName}`);
    box = await Box.create({
      runtime: 'node',
      name: cfg.baseBoxName,
      keepAlive: false,
      size: 'medium',
    });
    await ensureRunning(box);
  }

  await provisionBox(box, cfg);

  printBoxInfo(box, { title: `Base box for '${cfg.name}' is ready.`, status: 'running' });
  console.log('Next steps:');
  console.log('  1. SSH in and finish any manual setup (e.g. `claude login`)');
  console.log('  2. Run `devbox snapshot` to freeze the base image');
  console.log('  3. Create workspaces with `devbox create <name>`\n');

  if (!values['no-ssh'] && process.stdout.isTTY) {
    console.log('Connecting via SSH...');
    await interactiveSsh(box.id);
  }
  return 0;
}
