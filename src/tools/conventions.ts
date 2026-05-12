import * as fs from "node:fs/promises";
import * as path from "node:path";
import { home } from "../env.ts";
import { isDryRun, note } from "../dryrun.ts";
import { detectDrift, warnDrift } from "../managed-file.ts";
import type { Tool, ToolStatus, Ctx } from "./index.ts";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Generates ~/AGENTS.md from the install — only sections matching what was
// actually selected. Codex / Gemini read AGENTS.md natively; for Claude Code
// (which only reads CLAUDE.md), we drop a one-line ~/.claude/CLAUDE.md that
// imports AGENTS.md so there's a single source of truth.

function header(repo: Ctx["repo"]): string {
  return `# Devbox conventions for ${repo.owner}/${repo.name}

This devbox is dedicated to **${repo.owner}/${repo.name}** only. Tokens and tools are scoped accordingly.
`;
}

const RULES_SECTION = `## Default rules

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

### Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

### Rule 2 — Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

### Rule 3 — Surgical Changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

### Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

### Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

### Rule 6 — Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

### Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

### Rule 8 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

### Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

### Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

### Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

### Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.
`;

const GITHUB_SECTION = `## GitHub

\`gh\` uses \`GH_TOKEN\` (a fine-grained PAT scoped to this repo). The \`github\` MCP server is wired with the same token — prefer it over copy-paste:

- \`get_pull_request\` / \`get_pull_request_comments\` / \`list_review_comments\` for PR context.
- \`get_file_contents\` to read files at a specific ref.

When the user mentions a PR or comment, fetch through MCP rather than asking them to paste.
`;

const AGENT_BROWSER_SECTION = `## Browser

\`agent-browser\` is installed. Use it to verify UI changes and inspect console errors before reporting work as done:

\`\`\`
agent-browser open http://localhost:3000
agent-browser snapshot -i --json
agent-browser console --json
agent-browser network requests --json
\`\`\`
`;

const PACKAGE_INSTALLS_SECTION = `## Package installs

- \`npm\`, \`pnpm\`, \`yarn\`, \`pip\`, \`uv\`, \`cargo\` route install-like subcommands (\`install\`, \`add\`, \`update\`, …) through \`sfw\` (Socket Firewall), which blocks known-malicious packages at install. Other subcommands (\`run\`, \`dev\`, \`test\`, \`exec\`, …) bypass sfw and talk to the network directly, so tools they spawn (Doppler, \`gh\`) see the real cert chain. Use \`command <tool> …\` to skip sfw on an install if you ever need to.
- \`ignore-scripts=true\` is set globally. If a package needs scripts, run it explicitly: \`pnpm install --ignore-scripts=false <pkg>\`.
- \`bun install\` is not wrapped — prefer pnpm where you have a choice.
`;

function secretsSection(manager: Ctx["secretsManager"]): string {
  if (manager === "none") return "";
  const name = manager === "doppler" ? "Doppler" : "Infisical";
  return `## Secrets

${name} is scoped to this project's dev environment via a read-only service token. Don't try to switch projects, log in to a different account, or read \`~/.config/devbox/env\` directly.
`;
}

const DENIED_SECTION_BASE = `\`git push --force\`, \`git reset --hard\`, \`git clean -fd\`, \`git push --no-verify\`, and \`npm publish\` are denied by global devbox settings. If the user genuinely needs one of these, they'll run it themselves.`;

const DENIED_SECTION_NO_MAIN = `Direct pushes to the default branch and merges into the default branch (\`gh pr merge\`, \`git merge\` while on main) are also denied — land changes via PR review.`;

function deniedSection(ctx: Ctx): string {
  const blockMainMutations = ctx.gitMode === "write" && !ctx.gitWritePolicy.pushMain;
  const body = blockMainMutations
    ? `${DENIED_SECTION_BASE}\n\n${DENIED_SECTION_NO_MAIN}`
    : DENIED_SECTION_BASE;
  return `## Denied actions\n\n${body}\n`;
}

export function buildAgentsMd(ctx: Ctx): string {
  const has = (id: string) => ctx.selectedToolIds.has(id);
  const sections: string[] = [header(ctx.repo), RULES_SECTION];
  if (has("mcp") || has("github")) sections.push(GITHUB_SECTION);
  if (has("agent-browser")) sections.push(AGENT_BROWSER_SECTION);
  if (has("socket") || has("ignore-scripts")) sections.push(PACKAGE_INSTALLS_SECTION);
  const secrets = secretsSection(ctx.secretsManager);
  if (secrets) sections.push(secrets);
  sections.push(deniedSection(ctx));
  return sections.join("\n");
}

const CLAUDE_IMPORT_BODY = `@~/AGENTS.md\n`;

const tool: Tool = {
  id: "conventions",
  label: "Agent conventions (~/AGENTS.md)",
  default: true,
  required: true,
  async run(ctx): Promise<ToolStatus> {
    const agentsPath = path.join(home(), "AGENTS.md");
    const claudeMdPath = path.join(home(), ".claude", "CLAUDE.md");
    const installClaudeShim = ctx.selectedToolIds.has("claude");

    if (isDryRun()) {
      note("write", `${agentsPath} (sections gated by installed tools; skipped if present)`);
      if (installClaudeShim) note("write", `${claudeMdPath} (imports ~/AGENTS.md; skipped if present)`);
      return { kind: "installed" };
    }

    // Skip if already present so user edits aren't clobbered on re-run.
    // Drift check: if the on-disk content differs from what we would write
    // today (e.g. user changed tool selection on re-run), warn loudly so the
    // user knows the doc is stale.
    const agentsTarget = buildAgentsMd(ctx);
    let agentsKind: "installed" | "reused";
    if (await fileExists(agentsPath)) {
      const { stale } = await detectDrift(agentsPath, agentsTarget);
      if (stale) warnDrift(agentsPath, "Other handy things → Edit AGENTS.md or the 12 default rules");
      agentsKind = "reused";
    } else {
      await fs.writeFile(agentsPath, agentsTarget);
      agentsKind = "installed";
    }

    let claudeKind: "installed" | "reused" | "skipped" = "skipped";
    if (installClaudeShim) {
      if (await fileExists(claudeMdPath)) {
        claudeKind = "reused";
      } else {
        await fs.mkdir(path.dirname(claudeMdPath), { recursive: true });
        await fs.writeFile(claudeMdPath, CLAUDE_IMPORT_BODY);
        claudeKind = "installed";
      }
    }

    // The shim is small and rarely the headline, so the status reflects
    // AGENTS.md primarily. If the shim landed fresh while AGENTS.md was
    // reused, surface that as mixed so the user sees the shim was created.
    if (agentsKind === "installed") return { kind: "installed" };
    if (claudeKind === "installed") return { kind: "mixed", note: "AGENTS.md reused; CLAUDE.md shim installed" };
    return { kind: "reused", note: "AGENTS.md already present" };
  },
};

export default tool;
