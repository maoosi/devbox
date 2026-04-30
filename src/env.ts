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

// Read the env file written by writeEnv. Returns {} if the file is missing or
// unreadable. Tolerant parser: matches `KEY="value"` and `KEY=value`, unescapes
// the same `\"` writeEnv emits. Used to reuse already-validated secrets across
// re-runs of the installer instead of forcing the user to mint new ones.
export async function readEnv(): Promise<EnvVars> {
  let body: string;
  try {
    body = await fs.readFile(envFile(), "utf8");
  } catch {
    return {};
  }
  const out: EnvVars = {};
  for (const line of body.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="((?:[^"\\]|\\.)*)"$/) ?? line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    out[m[1]!] = m[2]!.replace(/\\"/g, '"');
  }
  return out;
}

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
