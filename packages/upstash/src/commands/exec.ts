import { loadConfig } from '../config';
import { ensureRunning, requireWorkspaceBox } from '../boxes';
import { ENV_PREAMBLE, shellQuote } from '@devbox/core';

export default async function exec(argv: string[]): Promise<number> {
  // `devbox exec <ws> -- cmd...` — everything after the first `--` is the command.
  const sep = argv.indexOf('--');
  const workspace = argv[0];
  const cmd = (sep >= 0 ? argv.slice(sep + 1) : argv.slice(1)).join(' ');
  if (!workspace || workspace === '--' || !cmd) {
    console.error('Usage: devbox exec <workspace> -- <command...>');
    return 1;
  }

  const cfg = await loadConfig();
  const box = await requireWorkspaceBox(cfg, workspace);
  await ensureRunning(box, { log: console.error });

  // exec 2>&1 is required: Run.result returns only stderr when it is non-empty.
  const script = `exec 2>&1\n${ENV_PREAMBLE}\ncd ${shellQuote(cfg.workdir)}\n${cmd}`;
  const r = await box.exec.command(`bash -c ${shellQuote(script)}`);
  if (r.result) console.log(r.result);
  return r.exitCode ?? 1;
}
