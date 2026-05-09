import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sh } from "../exec.ts";
import { home } from "../env.ts";
import { isDryRun, note } from "../dryrun.ts";
import type { Tool, GitWritePolicy } from "./index.ts";

function claudeDir(): string { return path.join(home(), ".claude"); }
function settingsPath(): string { return path.join(claudeDir(), "settings.json"); }

export type McpServer = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

// Always-deny: catch-all destructive shapes that have no creative phrasing.
// `git push --no-verify` is in here because the pre-push hook (installed by
// repo.ts) is the only thing enforcing main/delete policies, and --no-verify
// is a one-flag bypass. The env-file path is templated from $HOME at install
// time — Claude's deny patterns need an absolute path, not a `~` expansion.
function baseDeny(homeDir: string): string[] {
  return [
    "Bash(git push --force:*)",
    "Bash(git push -f:*)",
    "Bash(git push --no-verify:*)",
    "Bash(git reset --hard:*)",
    "Bash(git clean -fd:*)",
    "Bash(npm publish:*)",
    "Read(.env)",
    "Read(.env.*)",
    `Read(${path.join(homeDir, ".config", "devbox", "env")})`,
  ];
}

// Read-only mode: belt-and-suspenders on top of the read-scoped PAT.
const READ_ONLY_DENY = [
  "Bash(git push:*)",
  "Bash(git commit:*)",
  "Bash(gh pr create:*)",
  "Bash(gh pr edit:*)",
  "Bash(gh pr merge:*)",
  "Bash(gh issue create:*)",
];

// Write mode + pushMain=false: agent layer for the merge-into-main block.
// `gh pr merge` runs server-side and bypasses the local pre-merge-commit hook,
// so it has to be denied here. Local `git merge` is intentionally NOT blocked
// — the agent legitimately runs `git merge main` on a feature branch; the
// pre-merge-commit hook catches the on-main case.
const WRITE_NO_MAIN_DENY = [
  "Bash(gh pr merge:*)",
];

export function buildSettings(
  mcpServers: Record<string, McpServer>,
  gitMode: "read-only" | "write",
  policy: GitWritePolicy,
  homeDir: string = home(),
): Record<string, unknown> {
  const deny = [
    ...baseDeny(homeDir),
    ...(gitMode === "read-only" ? READ_ONLY_DENY : []),
    ...(gitMode === "write" && !policy.pushMain ? WRITE_NO_MAIN_DENY : []),
  ];
  return {
    includeCoAuthoredBy: false,
    permissions: {
      defaultMode: "auto",
      deny,
    },
    sandbox: {
      enabled: true,
      network: { allowLocalBinding: true },
    },
    theme: "light",
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
  };
}

// Writes a fresh ~/.claude/settings.json. Fresh-VM only — never merges, and
// never clobbers an existing file (re-runs leave the user's edits intact).
async function writeSettings(
  mcpServers: Record<string, McpServer>,
  gitMode: "read-only" | "write",
  policy: GitWritePolicy,
): Promise<void> {
  if (isDryRun()) {
    note("write", `${settingsPath()} (mcpServers: ${Object.keys(mcpServers).join(", ") || "none"}, mode: ${gitMode}; skipped if present)`);
    return;
  }
  try {
    await fs.access(settingsPath());
    return;
  } catch {
    /* not present — write a fresh one */
  }
  await fs.mkdir(claudeDir(), { recursive: true });
  const settings = buildSettings(mcpServers, gitMode, policy);
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2) + "\n");
}

// Optional: pick the agent CLI you want. Default on so the common case is
// one prompt away. Runs after the other tools so ctx.mcpServers is final
// when settings.json is written.
const tool: Tool = {
  id: "claude",
  label: "Claude Code",
  default: true,
  required: false,
  async run(ctx) {
    await sh(
      "bun install -g @anthropic-ai/claude-code || npm install -g @anthropic-ai/claude-code",
      { quiet: true },
    );
    await writeSettings(ctx.mcpServers, ctx.gitMode, ctx.gitWritePolicy);
  },
};

export default tool;
