import { existsSync } from 'node:fs';
import { configPath, loadConfig, localEnvPath, type ResolvedConfig } from '../config';
import { findBaseSnapshot } from '../boxes';

type Level = 'ok' | 'warn' | 'fail' | 'info';
const ICON: Record<Level, string> = { ok: '✓', warn: '!', fail: '✗', info: '·' };

export default async function doctor(_argv: string[]): Promise<number> {
  let failed = false;
  const report = (level: Level, label: string, detail = '') => {
    if (level === 'fail') failed = true;
    console.log(`${ICON[level]} ${label}${detail ? ` — ${detail}` : ''}`);
  };

  // Config
  let cfg: ResolvedConfig | undefined;
  if (!existsSync(configPath())) {
    report('fail', 'devbox.ts', `not found in ${process.cwd()}`);
  } else {
    report('ok', 'devbox.ts exists');
    try {
      cfg = await loadConfig();
      report('ok', 'config valid', `project '${cfg.name}' (${cfg.owner}/${cfg.repo})`);
    } catch (e) {
      report('fail', 'config valid', e instanceof Error ? e.message : String(e));
    }
  }

  // Credentials + local CLIs. loadLocalEnv() already ran at CLI startup, so
  // values from devbox.local.env are visible here.
  const envFile = localEnvPath();
  if (existsSync(envFile)) {
    report('ok', 'devbox.local.env exists');
    // A committed env file leaks tokens to everyone with repo access.
    const ignored = Bun.spawnSync(['git', 'check-ignore', '-q', envFile]);
    if (ignored.exitCode === 1) {
      report('fail', 'devbox.local.env gitignored', 'NOT ignored — add it to .gitignore');
    } else if (ignored.exitCode === 0) {
      report('ok', 'devbox.local.env gitignored');
    } // other exit codes: not a git repo — nothing to check
  } else {
    report('info', 'devbox.local.env', 'not present — credentials come from the shell env');
  }
  // Bun auto-loads ./.env at startup; those values look like shell env to us
  // and therefore take precedence over devbox.local.env. Surface the overlap.
  if (existsSync(envFile) && existsSync('.env')) {
    report('warn', '.env also present', 'Bun auto-loads it and it shadows devbox.local.env keys');
  }
  const apiKey = Bun.env.UPSTASH_BOX_API_KEY;
  report(
    apiKey ? 'ok' : 'fail',
    'UPSTASH_BOX_API_KEY',
    apiKey ? 'set' : 'not set (shell env or devbox.local.env)',
  );
  if (cfg) {
    report(
      cfg.githubToken ? 'ok' : 'warn',
      'repository.token',
      cfg.githubToken
        ? 'set'
        : 'not set — private repos will fail to clone and the GitHub MCP is skipped',
    );
  }
  report(Bun.which('ssh') ? 'ok' : 'fail', 'ssh CLI', Bun.which('ssh') ? '' : 'not on PATH');
  report(
    Bun.which('sshpass') ? 'ok' : 'warn',
    'sshpass',
    Bun.which('sshpass') ? '' : 'not installed — SSH will prompt for the API key as password',
  );
  if (cfg) {
    const editorBin = cfg.editor === 'zed' ? 'zed' : 'code';
    report(
      Bun.which(editorBin) ? 'ok' : 'warn',
      `editor CLI (${editorBin})`,
      Bun.which(editorBin) ? '' : `not on PATH — 'devbox open' will print the command instead`,
    );
  }

  // Remote state (needs config + credentials)
  if (cfg && apiKey) {
    try {
      const found = await findBaseSnapshot(cfg);
      if (!found) {
        report('info', 'base box', `'${cfg.baseBoxName}' not found — run 'devbox init'`);
      } else {
        report('ok', 'base box', found.baseBox.id);
        if (found.snapshot) report('ok', 'base snapshot', found.snapshot.id);
        else report('info', 'base snapshot', `none — run 'devbox snapshot'`);
      }
    } catch (e) {
      report('fail', 'Upstash API reachable', e instanceof Error ? e.message : String(e));
    }
  }

  console.log(failed ? '\nSome required checks failed.' : '\nAll required checks passed.');
  return failed ? 1 : 0;
}
