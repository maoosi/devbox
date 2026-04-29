import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sh } from "../exec.ts";
import { HOME } from "../env.ts";
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
async function writeSettings(mcpServers: Record<string, McpServer>): Promise<void> {
  await fs.mkdir(CLAUDE_DIR, { recursive: true });
  const settings = {
    includeCoAuthoredBy: false,
    permissions: {
      defaultMode: "auto",
      deny: [
        "Bash(git push --force:*)",
        "Bash(git push -f:*)",
        "Bash(git reset --hard:*)",
        "Bash(git clean -fd:*)",
        "Bash(npm publish:*)",
        "Read(.env)",
        "Read(.env.*)",
        "Read(/home/devbox/.config/devbox/env)",
      ],
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
    await writeSettings(ctx.mcpServers);
  },
};

export default tool;
