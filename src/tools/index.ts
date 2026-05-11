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
  // Ids of all tools that will run in this install. Populated by cli.ts before
  // the loop so late tools (e.g. conventions) can gate sections on what's installed.
  selectedToolIds: Set<string>;
};

// What a tool did on this run. The cli loop uses this to stamp the spinner
// (✓ / ↻) and group the end-of-run summary into Installed / Reused buckets,
// so a re-run is visibly different from a first install.
export type ToolStatus =
  | { kind: "installed"; note?: string }   // work happened
  | { kind: "reused"; note?: string }      // existing state preserved, no-op
  | { kind: "mixed"; note?: string };      // some sub-actions installed, some reused

export type Tool = {
  id: string;
  label: string;
  hint?: string;
  default: boolean;
  required: boolean;
  // Returning void is treated as { kind: "installed" } — for tools whose work
  // is naturally idempotent and where every run is "did the work."
  run: (ctx: Ctx) => Promise<ToolStatus | void>;
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
import skills from "./skills.ts";
import conventions from "./conventions.ts";
import guide from "./guide.ts";

// Order matters:
//   - github runs before repo (clone needs ctx.tokens.GH_TOKEN).
//   - claude runs after mcp so ctx.mcpServers is populated when it writes settings.json.
//   - conventions and guide run last — they read ctx.selectedToolIds and
//     ctx.gitMode to gate sections in the markdown they write.
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
  skills,
  conventions,
  guide,
];

// Resolves which tools to actually run, given:
//   - allTools: the canonical ordered list
//   - pickedIds: ids from the optional-tools multiselect (no required, no secrets managers)
//   - secretsManager: auto-includes the chosen one; the other one is hidden
// Required tools are always included. The non-chosen secrets manager is excluded
// even if a caller somehow passes it in pickedIds.
export function selectTools(
  allTools: Tool[],
  pickedIds: Set<string>,
  secretsManager: Ctx["secretsManager"],
): Tool[] {
  const isSecretsTool = (id: string) => id === "doppler" || id === "infisical";
  const otherSecrets = secretsManager === "doppler" ? "infisical" : secretsManager === "infisical" ? "doppler" : null;
  const auto = new Set<string>(secretsManager !== "none" ? [secretsManager] : []);
  return allTools.filter((t) => {
    if (isSecretsTool(t.id) && otherSecrets === t.id) return false;
    return t.required || pickedIds.has(t.id) || auto.has(t.id);
  });
}
