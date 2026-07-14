import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { run, sh } from "./exec.ts";

// Resolved at call time — process.env.HOME overrides homedir() so tests can
// point the installer at a sandbox tempdir without forking a child process.
export function home(): string {
  return process.env.HOME ?? homedir();
}
export function configDir(): string {
  return path.join(home(), ".config", "devbox");
}
export function envFile(): string {
  return path.join(configDir(), "env");
}
export function bashrcD(): string {
  return path.join(home(), ".bashrc.d");
}
export function devboxSh(): string {
  return path.join(bashrcD(), "devbox.sh");
}
export function bashrc(): string {
  return path.join(home(), ".bashrc");
}

const SOURCE_LINE = `for f in ~/.bashrc.d/*.sh; do [ -r "$f" ] && . "$f"; done`;

export type EnvVars = Record<string, string>;

// Read the env file written by @devbox/core's upsertEnv (`export KEY='value'`
// lines, single-quote shell escaping). Returns {} if the file is missing or
// unreadable. Also tolerates the legacy `KEY="value"` format from
// pre-monorepo installs so stored tokens survive the upgrade. Used to reuse
// already-validated secrets across re-runs of the installer instead of
// forcing the user to mint new ones.
export async function readEnv(): Promise<EnvVars> {
  let body: string;
  try {
    body = await fs.readFile(envFile(), "utf8");
  } catch {
    return {};
  }
  const out: EnvVars = {};
  for (const line of body.split("\n")) {
    // Current format: export KEY='value' (shellQuote escaping: ' → '\'')
    const cur = line.match(/^export ([A-Z_][A-Z0-9_]*)='(.*)'$/);
    if (cur) {
      out[cur[1]!] = cur[2]!.replaceAll(`'\\''`, `'`);
      continue;
    }
    // Legacy formats: KEY="value" (\" escaping) and bare KEY=value.
    const legacy =
      line.match(/^([A-Z_][A-Z0-9_]*)="((?:[^"\\]|\\.)*)"$/) ??
      line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (legacy) out[legacy[1]!] = legacy[2]!.replace(/\\"/g, '"');
  }
  return out;
}

// PAM loads /etc/environment for every session type — login/non-login,
// interactive/non-interactive — so remote SSH commands (e.g. Claude Code
// Desktop's SSH integration, which uses non-interactive exec) inherit these
// vars without sourcing .bashrc. Without this, GH_TOKEN is unset in those
// sessions and `gh` falls back to "not logged in".
//
// Tradeoff: tokens land in a system-wide file. We tighten it to mode 0600
// root:root — PAM runs as root and loads the file before dropping to the
// user, so the user's session env still has the vars. On a single-user
// devbox VM, the trust boundary is the same as ~/.config/devbox/env.
//
// Note: PAM's format is plain KEY="value" lines — it cannot use the env
// file's `export` lines, so this keeps its own rendering.
const ETC_ENV = "/etc/environment";
const ETC_ENV_BEGIN = "# BEGIN devbox";
const ETC_ENV_END = "# END devbox";

export async function writeSystemEnv(vars: EnvVars): Promise<void> {
  // Read existing /etc/environment via sudo so we work whether mode is 0644
  // (Ubuntu default) or already 0600 root-owned from a prior install. allowFail
  // covers the rare case the file doesn't exist yet.
  const read = await run("sudo", ["cat", ETC_ENV], { quiet: true, allowFail: true });
  const existing = read.code === 0 ? read.stdout : "";
  const blockRe = new RegExp(`\\n?${ETC_ENV_BEGIN}[\\s\\S]*?${ETC_ENV_END}\\n?`, "g");
  const stripped = existing.replace(blockRe, "");
  const block = [
    ETC_ENV_BEGIN,
    ...Object.entries(vars).map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`),
    ETC_ENV_END,
  ].join("\n");
  const trimmed = stripped.replace(/\n+$/, "");
  const merged = (trimmed === "" ? "" : trimmed + "\n") + block + "\n";
  // Stage in a 0600 user-owned tmp file under the user's already-restricted
  // config dir, then atomically replace /etc/environment with sudo install.
  const tmp = path.join(configDir(), ".etc-environment.tmp");
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  await fs.writeFile(tmp, merged, { mode: 0o600 });
  try {
    await sh(`sudo install -m 0600 -o root -g root ${tmp} ${ETC_ENV}`, { quiet: true });
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

// Writes a single ~/.bashrc.d/devbox.sh that loads the env file and sets aliases/exports.
// Adds one line to ~/.bashrc that sources everything in ~/.bashrc.d/.
export async function writeShellInit(opts: {
  exports?: string[];
  aliases?: string[];
  cdSlug?: string;
}): Promise<void> {
  const shFile = devboxSh();
  const bashrcFile = bashrc();
  await fs.mkdir(bashrcD(), { recursive: true });
  const lines: string[] = [
    `# managed by devbox install — do not edit by hand`,
    // The env file carries its own `export` prefixes (written by core's
    // upsertEnv), so plain sourcing is enough — no set -a dance.
    `[ -f ${envFile()} ] && . ${envFile()}`,
    ...(opts.exports ?? []),
    ...(opts.aliases ?? []),
  ];
  if (opts.cdSlug) {
    // Interactive-only — some distros source .bashrc for non-interactive
    // shells (scp, rsync, `bash -c "…"`) and an unguarded cd would break them.
    lines.push(`[[ $- == *i* ]] && [ -d ~/${opts.cdSlug} ] && cd ~/${opts.cdSlug}`);
  }
  lines.push("");
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

export function parseRepoUrl(url: string): { owner: string; name: string; slug: string } | null {
  const cleaned = url.trim().replace(/\.git$/, "");
  const m =
    cleaned.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/) ??
    cleaned.match(/^git@github\.com:([^/]+)\/([^/]+?)\/?$/) ??
    cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m) return null;
  return { owner: m[1]!, name: m[2]!, slug: m[2]! };
}

// We only pre-fill `name` and `description`. Resource owner, repository
// access, and permissions are walked through manually in the prompt copy
// (see github.ts).
//
// Why not pre-fill more? GitHub's `target_name` param visually selects the
// resource-owner dropdown, but doesn't commit the form state — submitted
// tokens silently fall back to the user's personal account, granting access
// to 0 org repos. Forcing the user to toggle the dropdown manually drops the
// pre-filled permissions in the same form. Until the upstream bug is fixed
// we keep the URL minimal. See:
//   https://github.com/orgs/community/discussions/188111
//
// When that bug is fixed, the richer pre-fill is preserved below — uncomment
// `ghFineGrainedTokenUrlFull`, swap the call site in github.ts, and simplify
// the manual instructions.
//
// `access` is plumbed for the future-rich version; the minimal one ignores it.
//   - "read"  → contents/PRs are read-only; agent can fetch + post nothing
//   - "write" → contents=write + PRs=write so the agent can push and open PRs
export function ghFineGrainedTokenUrl(opts: {
  name: string;
  description: string;
  ownerLogin: string;
  access: "read" | "write";
}): string {
  void opts.ownerLogin;
  void opts.access;
  const params = new URLSearchParams({
    name: opts.name,
    description: opts.description,
  });
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`;
}

// Restore once https://github.com/orgs/community/discussions/188111 is fixed.
// export function ghFineGrainedTokenUrlFull(opts: {
//   name: string;
//   description: string;
//   ownerLogin: string;
//   access: "read" | "write";
// }): string {
//   const params = new URLSearchParams({
//     name: opts.name,
//     description: opts.description,
//     target_name: opts.ownerLogin,
//     metadata: "read",
//     contents: opts.access,
//     pull_requests: opts.access,
//     issues: "read",
//     commit_statuses: "read",
//     actions: "read",
//     discussions: "read",
//   });
//   return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`;
// }

export function ghClassicTokenUrl(opts: { name: string }): string {
  const params = new URLSearchParams({
    description: opts.name,
    scopes: "repo,read:org",
  });
  return `https://github.com/settings/tokens/new?${params.toString()}`;
}
