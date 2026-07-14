import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GitWritePolicy } from '@devbox/core';
import type { DevboxConfig, Editor, SetupStep, ToolchainTool } from './index';
import { NAME_RE, baseBoxName, snapshotName } from './names';

// Resolve the bare 'devbox' specifier inside project devbox.ts files to this
// CLI's own DSL module, so any directory works without node_modules or npm.
// A virtual module is required: Bun's runtime resolution of bare specifiers
// bypasses onResolve plugins. Module-scoped here: active for every CLI path,
// never for package consumers (src/index.ts does not import config.ts).
Bun.plugin({
  name: 'devbox-self-resolve',
  setup(build) {
    build.module('devbox', async () => ({
      exports: await import('./index'),
      loader: 'object',
    }));
  },
});

const TOOLS: ToolchainTool[] = ['bun', 'pnpm', 'yarn', 'pulumi', 'vite-plus', 'agent-browser'];
const PROVIDERS = ['infisical', 'doppler'] as const;
const EDITORS: Editor[] = ['zed', 'code'];

export type ResolvedConfig = {
  name: string;
  baseBoxName: string;
  snapshotName: string;
  owner: string;
  repo: string;
  branch: string;
  workdir: string;
  mode: 'write' | 'read-only';
  writePolicy: GitWritePolicy;
  toolchain: ToolchainTool[];
  secrets: { provider: 'infisical' | 'doppler'; token: string }[];
  setup: SetupStep[];
  editor: Editor;
  githubToken: string;
};

export class ConfigError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate a raw config object (the default export of devbox.ts) and apply defaults. */
export function resolveConfig(raw: unknown): ResolvedConfig {
  const errors: string[] = [];
  const err = (msg: string) => void errors.push(msg);
  const cfg = raw as DevboxConfig;

  if (!isRecord(raw)) {
    throw new ConfigError('devbox.ts default export must be a devbox({...}) config object');
  }

  if (typeof cfg.name !== 'string' || !NAME_RE.test(cfg.name)) {
    err(`name: must be a lowercase string matching ${NAME_RE} (got ${JSON.stringify(cfg.name)})`);
  }

  let owner = '';
  let repo = '';
  if (!isRecord(cfg.repository) || typeof cfg.repository.slug !== 'string') {
    err(`repository: must be { slug: 'owner/repo', branch?: string, token?: string }`);
  } else {
    const parts = cfg.repository.slug.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      err(`repository.slug: expected 'owner/repo', got ${JSON.stringify(cfg.repository.slug)}`);
    } else {
      [owner, repo] = parts as [string, string];
    }
    if (cfg.repository.branch !== undefined && typeof cfg.repository.branch !== 'string') {
      err(`repository.branch: must be a string`);
    }
    if (cfg.repository.token !== undefined && typeof cfg.repository.token !== 'string') {
      err(
        `repository.token: must be a string — is the env var set (shell or devbox.local.env)?`,
      );
    }
  }

  if (cfg.workdir !== undefined && typeof cfg.workdir !== 'string') err(`workdir: must be a string`);
  if (cfg.mode !== undefined && cfg.mode !== 'write' && cfg.mode !== 'read-only') {
    err(`mode: must be 'write' or 'read-only' (got ${JSON.stringify(cfg.mode)})`);
  }
  if (cfg.editor !== undefined && !EDITORS.includes(cfg.editor)) {
    err(`editor: must be one of ${EDITORS.join(', ')} (got ${JSON.stringify(cfg.editor)})`);
  }

  const writePolicy: GitWritePolicy = { pushMain: false, deleteBranches: false };
  if (cfg.writePolicy !== undefined) {
    if (!isRecord(cfg.writePolicy)) {
      err(`writePolicy: must be { pushMain?: boolean, deleteBranches?: boolean }`);
    } else {
      for (const key of ['pushMain', 'deleteBranches'] as const) {
        const v = cfg.writePolicy[key];
        if (v !== undefined && typeof v !== 'boolean') err(`writePolicy.${key}: must be a boolean`);
        else if (v === true) writePolicy[key] = true;
      }
    }
  }

  const toolchain: ToolchainTool[] = [];
  if (cfg.toolchain !== undefined) {
    if (!Array.isArray(cfg.toolchain)) err(`toolchain: must be an array, e.g. [bun(), pnpm()]`);
    else {
      cfg.toolchain.forEach((t, i) => {
        if (!isRecord(t) || t.kind !== 'toolchain' || !TOOLS.includes(t.tool)) {
          err(
            `toolchain[${i}]: expected bun(), pnpm(), yarn(), pulumi(), vitePlus() or agentBrowser()`,
          );
        } else if (!toolchain.includes(t.tool)) toolchain.push(t.tool);
      });
    }
  }

  const secrets: ResolvedConfig['secrets'] = [];
  if (cfg.secrets !== undefined) {
    if (!Array.isArray(cfg.secrets)) err(`secrets: must be an array, e.g. [infisical({ token })]`);
    else {
      cfg.secrets.forEach((s, i) => {
        if (!isRecord(s) || s.kind !== 'secret' || !PROVIDERS.includes(s.provider)) {
          err(`secrets[${i}]: expected infisical({ token }) or doppler({ token })`);
        } else if (typeof s.token !== 'string' || !s.token) {
          err(
            `secrets[${i}] (${s.provider}): token is missing or empty — is the token env var exported in your shell?`,
          );
        } else secrets.push({ provider: s.provider, token: s.token });
      });
    }
  }

  const setup: SetupStep[] = [];
  if (cfg.setup !== undefined) {
    if (!Array.isArray(cfg.setup)) err(`setup: must be an array, e.g. [command('bun install')]`);
    else {
      cfg.setup.forEach((s, i) => {
        const okCommand =
          isRecord(s) && s.kind === 'setup' && s.step === 'command' && typeof s.command === 'string' && s.command;
        const okPulumi = isRecord(s) && s.kind === 'setup' && s.step === 'pulumi-install';
        if (!okCommand && !okPulumi) {
          err(`setup[${i}]: expected command('...') or pulumi.install({...})`);
        } else setup.push(s);
      });
    }
  }

  if (errors.length) {
    throw new ConfigError(`Invalid devbox.ts config:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  return {
    name: cfg.name,
    baseBoxName: baseBoxName(cfg.name),
    snapshotName: snapshotName(cfg.name),
    owner,
    repo,
    branch: cfg.repository.branch ?? 'main',
    workdir: cfg.workdir ?? repo,
    mode: cfg.mode ?? 'write',
    writePolicy,
    toolchain: cfg.toolchain === undefined ? ['bun', 'pnpm', 'yarn'] : toolchain,
    secrets,
    setup,
    editor: cfg.editor ?? 'zed',
    githubToken: cfg.repository.token ?? '',
  };
}

export function configPath(cwd = process.cwd()): string {
  return resolve(cwd, 'devbox.ts');
}

export function localEnvPath(cwd = process.cwd()): string {
  return resolve(cwd, 'devbox.local.env');
}

/**
 * Parse a dotenv-style file: `KEY=value` lines, optional `export ` prefix,
 * optional single/double quotes around the value, `#` comment lines. No
 * interpolation, no multi-line values — this holds tokens, not scripts.
 */
export function parseEnvFile(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]!] = value;
  }
  return out;
}

/**
 * Load ./devbox.local.env (if present) into process.env so per-project
 * credentials (UPSTASH_BOX_API_KEY, GITHUB_TOKEN, INFISICAL_TOKEN, ...) don't
 * have to live in the shell profile. Real environment variables win over the
 * file, so one-off overrides (`GITHUB_TOKEN=... devbox init`) still work.
 * Called once at CLI startup, before devbox.ts is loaded.
 */
export function loadLocalEnv(cwd = process.cwd()): void {
  const file = localEnvPath(cwd);
  if (!existsSync(file)) return;
  const vars = parseEnvFile(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(vars)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Load + validate ./devbox.ts from the current project. */
export async function loadConfig(cwd = process.cwd()): Promise<ResolvedConfig> {
  const file = configPath(cwd);
  if (!existsSync(file)) {
    throw new ConfigError(
      `No devbox.ts found in ${cwd}. Create one — run 'devbox help' for an example.`,
    );
  }
  let mod: { default?: unknown };
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (e) {
    throw new ConfigError(`Error while loading devbox.ts: ${e instanceof Error ? e.message : e}`);
  }
  if (!mod.default) {
    throw new ConfigError(`devbox.ts must \`export default devbox({...})\``);
  }
  return resolveConfig(mod.default);
}
