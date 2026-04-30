import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { isDryRun, note } from "./dryrun.ts";

// Resolved at call time — process.env.HOME overrides homedir() so tests can
// point the installer at a sandbox tempdir without forking a child process.
export function home(): string {
  return process.env.HOME ?? homedir();
}
export function configDir(): string { return path.join(home(), ".config", "devbox"); }
export function envFile(): string { return path.join(configDir(), "env"); }
export function bashrcD(): string { return path.join(home(), ".bashrc.d"); }
export function devboxSh(): string { return path.join(bashrcD(), "devbox.sh"); }
export function bashrc(): string { return path.join(home(), ".bashrc"); }

const SOURCE_LINE = `for f in ~/.bashrc.d/*.sh; do [ -r "$f" ] && . "$f"; done`;

export type EnvVars = Record<string, string>;

export async function writeEnv(vars: EnvVars): Promise<void> {
  const envPath = envFile();
  if (isDryRun()) {
    note("write", `${envPath} (${Object.keys(vars).length} keys: ${Object.keys(vars).join(", ")})`);
    return;
  }
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join("\n");
  await fs.writeFile(envPath, body + "\n", { mode: 0o600 });
}

// Writes a single ~/.bashrc.d/devbox.sh that loads the env file and sets aliases/exports.
// Adds one line to ~/.bashrc that sources everything in ~/.bashrc.d/.
export async function writeShellInit(opts: {
  exports?: string[];
  aliases?: string[];
}): Promise<void> {
  const shFile = devboxSh();
  const bashrcFile = bashrc();
  if (isDryRun()) {
    note("write", `${shFile} (${(opts.exports ?? []).length} exports, ${(opts.aliases ?? []).length} aliases)`);
    note("append", `${bashrcFile} (source line, if missing)`);
    return;
  }
  await fs.mkdir(bashrcD(), { recursive: true });
  const lines: string[] = [
    `# managed by devbox install — do not edit by hand`,
    `[ -f ${envFile()} ] && set -a && . ${envFile()} && set +a`,
    ...(opts.exports ?? []),
    ...(opts.aliases ?? []),
    "",
  ];
  await fs.writeFile(shFile, lines.join("\n"));

  let body = "";
  try {
    body = await fs.readFile(bashrcFile, "utf8");
  } catch {
    /* fresh VM may not have one */
  }
  if (!body.includes(SOURCE_LINE)) {
    await fs.appendFile(bashrcFile, `\n${SOURCE_LINE}\n`);
  }
}

export function parseRepoUrl(
  url: string,
): { owner: string; name: string; slug: string } | null {
  const cleaned = url.trim().replace(/\.git$/, "");
  const m =
    cleaned.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/) ??
    cleaned.match(/^git@github\.com:([^/]+)\/([^/]+?)\/?$/) ??
    cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m) return null;
  return { owner: m[1]!, name: m[2]!, slug: m[2]! };
}

// URL params here follow GitHub's documented spec for fine-grained PAT pre-fill.
// We don't set `expires_in` because it forces the form into "Custom" mode,
// which is harder to read than just leaving the default. There is no
// documented param for prefilling repo selection — the user picks the repo
// manually. `target_name` narrows the resource owner dropdown.
//
// `access` controls whether the token can mutate the repo:
//   - "read"  → contents/PRs are read-only; agent can fetch + post nothing
//   - "write" → contents=write + PRs=write so the agent can push and open PRs
export function ghFineGrainedTokenUrl(opts: {
  name: string;
  description: string;
  ownerLogin: string;
  access: "read" | "write";
}): string {
  const params = new URLSearchParams({
    name: opts.name,
    description: opts.description,
    target_name: opts.ownerLogin,
    metadata: "read",
    contents: opts.access,
    pull_requests: opts.access,
    issues: "read",
    commit_statuses: "read",
    actions: "read",
    discussions: "read",
  });
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`;
}

export function ghClassicTokenUrl(opts: { name: string }): string {
  const params = new URLSearchParams({
    description: opts.name,
    scopes: "repo,read:org",
  });
  return `https://github.com/settings/tokens/new?${params.toString()}`;
}
