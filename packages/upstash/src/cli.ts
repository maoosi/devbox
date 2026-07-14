#!/usr/bin/env bun
import { ConfigError, loadLocalEnv } from './config';
import init from './commands/init';
import snapshot from './commands/snapshot';
import create from './commands/create';
import info from './commands/info';
import ssh from './commands/ssh';
import exec from './commands/exec';
import open from './commands/open';
import pull from './commands/pull';
import url from './commands/url';
import del from './commands/delete';
import list from './commands/list';
import reset from './commands/reset';
import doctor from './commands/doctor';
import help from './commands/help';

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  init,
  snapshot,
  create,
  info,
  ssh,
  exec,
  open,
  pull,
  url,
  delete: del,
  list,
  reset,
  doctor,
  help,
};

// Per-project credentials (UPSTASH_BOX_API_KEY, GITHUB_TOKEN, ...) can live in
// ./devbox.local.env instead of the shell profile. Loaded before any command
// runs so the Upstash SDK and devbox.ts both see them; shell env wins.
loadLocalEnv();

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  process.exit(await help(rest));
}

const handler = COMMANDS[cmd];
if (!handler) {
  console.error(`Unknown command '${cmd}'. Run 'devbox help' for usage.`);
  process.exit(1);
}

try {
  process.exit(await handler(rest));
} catch (e) {
  if (e instanceof ConfigError) console.error(e.message);
  else console.error(`Error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
