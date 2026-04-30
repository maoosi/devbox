import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sh } from "../exec.ts";
import { HOME } from "../env.ts";
import { isDryRun, note } from "../dryrun.ts";
import type { Tool } from "./index.ts";

const CLAUDE_DIR = path.join(HOME, ".claude");
const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");

export type McpServer = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

// Writes a fresh ~/.claude/settings.json. Fresh-VM only — no merge.
async function writeSettings(
  mcpServers: Record<string, McpServer>,
  gitMode: "read-only" | "write",
): Promise<void> {
  // Always-deny: catch-all destructive shapes that have no creative phrasing.
  // `git push --no-verify` is in here because the pre-push hook (installed by
  // repo.ts) is the only thing enforcing main/delete policies, and --no-verify
  // is a one-flag bypass.
  const baseDeny = [
    "Bash(git push --force:*)",
    "Bash(git push -f:*)",
    "Bash(git push --no-verify:*)",
    "Bash(git reset --hard:*)",
    "Bash(git clean -fd:*)",
    "Bash(npm publish:*)",
    "Read(.env)",
    "Read(.env.*)",
    "Read(/home/devbox/.config/devbox/env)",
  ];
  // Read-only mode: belt-and-suspenders on top of the read-scoped PAT.
  const readOnlyDeny =
    gitMode === "read-only"
      ? [
          "Bash(git push:*)",
          "Bash(git commit:*)",
          "Bash(gh pr create:*)",
          "Bash(gh pr edit:*)",
          "Bash(gh pr merge:*)",
          "Bash(gh issue create:*)",
        ]
      : [];

  if (isDryRun()) {
    note("write", `${SETTINGS_PATH} (mcpServers: ${Object.keys(mcpServers).join(", ") || "none"}, mode: ${gitMode})`);
    return;
  }
  await fs.mkdir(CLAUDE_DIR, { recursive: true });
  const settings = {
    includeCoAuthoredBy: false,
    permissions: {
      defaultMode: "auto",
      deny: [...baseDeny, ...readOnlyDeny],
    },
    sandbox: {
      enabled: true,
      network: { allowLocalBinding: true },
    },
    theme: "light",
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
  };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

// Runs last so ctx.mcpServers (populated by other tools) is final by now.
const tool: Tool = {
  id: "claude",
  label: "Claude Code",
  default: true,
  required: true,
  async run(ctx) {
    await sh(
      "bun install -g @anthropic-ai/claude-code || npm install -g @anthropic-ai/claude-code",
      { quiet: true },
    );
    await writeSettings(ctx.mcpServers, ctx.gitMode);
  },
};

export default tool;
