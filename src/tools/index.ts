import type { McpServer } from "./claude.ts";

export type GitMode = "read-only" | "write";

export type GitWritePolicy = {
  pushMain: boolean;        // allow direct pushes to the default branch
  deleteBranches: boolean;  // allow deleting branches (local + remote)
};

export type Ctx = {
  repo: { url: string; owner: string; name: string; slug: string };
  secretsManager: "doppler" | "infisical" | "none";
  gitMode: GitMode;
  gitWritePolicy: GitWritePolicy;
  tokens: Record<string, string>;
  exports: string[];
  aliases: string[];
  mcpServers: Record<string, McpServer>;
};

export type Tool = {
  id: string;
  label: string;
  hint?: string;
  default: boolean;
  required: boolean;
  run: (ctx: Ctx) => Promise<void>;
};

import system from "./system.ts";
import runtimes from "./runtimes.ts";
import claude from "./claude.ts";
import github from "./github.ts";
import doppler from "./doppler.ts";
import infisical from "./infisical.ts";
import agentBrowser from "./agent-browser.ts";
import socket from "./socket.ts";
import vitePlus from "./vite-plus.ts";
import ignoreScripts from "./ignore-scripts.ts";
import mcp from "./mcp.ts";
import repo from "./repo.ts";

// Order matters: claude runs last so ctx.mcpServers is populated when it
// writes ~/.claude/settings.json. Repo cloning needs ctx.tokens.GH_TOKEN, so
// github runs before repo.
export const tools: Tool[] = [
  system,
  runtimes,
  github,
  doppler,
  infisical,
  agentBrowser,
  socket,
  vitePlus,
  ignoreScripts,
  mcp,
  repo,
  claude,
];
