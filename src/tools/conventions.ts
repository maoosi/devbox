import * as fs from "node:fs/promises";
import * as path from "node:path";
import { home } from "../env.ts";
import { isDryRun, note } from "../dryrun.ts";
import type { Tool, Ctx } from "./index.ts";

// Generates ~/AGENTS.md from the install — only sections matching what was
// actually selected. Codex / Gemini read AGENTS.md natively; for Claude Code
// (which only reads CLAUDE.md), we drop a one-line ~/.claude/CLAUDE.md that
// imports AGENTS.md so there's a single source of truth.

function header(repo: Ctx["repo"]): string {
  return `# Devbox conventions for ${repo.owner}/${repo.name}

This devbox is dedicated to **${repo.owner}/${repo.name}** only. Tokens and tools are scoped accordingly.
`;
}

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

- \`npm\`, \`pnpm\`, \`yarn\`, \`pip\`, \`uv\`, \`cargo\` are aliased through \`sfw\` (Socket Firewall) — known-malicious packages are blocked.
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

const DENIED_SECTION = `## Denied actions

\`git push --force\`, \`git reset --hard\`, \`git clean -fd\`, \`git push --no-verify\`, and \`npm publish\` are denied by global devbox settings. If the user genuinely needs one of these, they'll run it themselves.
`;

export function buildAgentsMd(ctx: Ctx): string {
  const has = (id: string) => ctx.selectedToolIds.has(id);
  const sections: string[] = [header(ctx.repo)];
  if (has("mcp") || has("github")) sections.push(GITHUB_SECTION);
  if (has("agent-browser")) sections.push(AGENT_BROWSER_SECTION);
  if (has("socket") || has("ignore-scripts")) sections.push(PACKAGE_INSTALLS_SECTION);
  const secrets = secretsSection(ctx.secretsManager);
  if (secrets) sections.push(secrets);
  sections.push(DENIED_SECTION);
  return sections.join("\n");
}

const CLAUDE_IMPORT_BODY = `@~/AGENTS.md\n`;

const tool: Tool = {
  id: "conventions",
  label: "Agent conventions (~/AGENTS.md)",
  default: true,
  required: true,
  async run(ctx) {
    const agentsPath = path.join(home(), "AGENTS.md");
    const claudeMdPath = path.join(home(), ".claude", "CLAUDE.md");
    const installClaudeShim = ctx.selectedToolIds.has("claude");

    if (isDryRun()) {
      note("write", `${agentsPath} (sections gated by installed tools)`);
      if (installClaudeShim) note("write", `${claudeMdPath} (imports ~/AGENTS.md)`);
      return;
    }

    await fs.writeFile(agentsPath, buildAgentsMd(ctx));

    if (installClaudeShim) {
      await fs.mkdir(path.dirname(claudeMdPath), { recursive: true });
      await fs.writeFile(claudeMdPath, CLAUDE_IMPORT_BODY);
    }
  },
};

export default tool;
