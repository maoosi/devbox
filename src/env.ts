import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { isDryRun, note } from "./dryrun.ts";

export const HOME = homedir();
export const CONFIG_DIR = path.join(HOME, ".config", "devbox");
export const ENV_FILE = path.join(CONFIG_DIR, "env");
export const BASHRC_D = path.join(HOME, ".bashrc.d");
export const DEVBOX_SH = path.join(BASHRC_D, "devbox.sh");
export const BASHRC = path.join(HOME, ".bashrc");

const SOURCE_LINE = `for f in ~/.bashrc.d/*.sh; do [ -r "$f" ] && . "$f"; done`;

export type EnvVars = Record<string, string>;

export async function writeEnv(vars: EnvVars): Promise<void> {
  if (isDryRun()) {
    note("write", `${ENV_FILE} (${Object.keys(vars).length} keys: ${Object.keys(vars).join(", ")})`);
    return;
  }
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join("\n");
  await fs.writeFile(ENV_FILE, body + "\n", { mode: 0o600 });
}

// Writes a single ~/.bashrc.d/devbox.sh that loads the env file and sets aliases/exports.
// Adds one line to ~/.bashrc that sources everything in ~/.bashrc.d/.
export async function writeShellInit(opts: {
  exports?: string[];
  aliases?: string[];
}): Promise<void> {
  if (isDryRun()) {
    note("write", `${DEVBOX_SH} (${(opts.exports ?? []).length} exports, ${(opts.aliases ?? []).length} aliases)`);
    note("append", `${BASHRC} (source line, if missing)`);
    return;
  }
  await fs.mkdir(BASHRC_D, { recursive: true });
  const lines: string[] = [
    `# managed by devbox install — do not edit by hand`,
    `[ -f ${ENV_FILE} ] && set -a && . ${ENV_FILE} && set +a`,
    ...(opts.exports ?? []),
    ...(opts.aliases ?? []),
    "",
  ];
  await fs.writeFile(DEVBOX_SH, lines.join("\n"));

  let bashrc = "";
  try {
    bashrc = await fs.readFile(BASHRC, "utf8");
  } catch {
    /* fresh VM may not have one */
  }
  if (!bashrc.includes(SOURCE_LINE)) {
    await fs.appendFile(BASHRC, `\n${SOURCE_LINE}\n`);
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
