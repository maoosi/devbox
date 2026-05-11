import * as fs from "node:fs/promises";
import * as path from "node:path";
import { home } from "../env.ts";
import { isDryRun, note } from "../dryrun.ts";
import type { Tool, Ctx } from "./index.ts";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Generates ~/DEVBOX.md from the install — a human-facing reference for the
// devbox itself (rotate tokens, edit Claude config, change git permissions, …).
// Sections are gated on what was actually installed so the guide never
// documents a tool the user did not pick.

function header(repo: Ctx["repo"]): string {
  return `# Devbox guide for ${repo.owner}/${repo.name}

Quick reference for running, editing, and rotating credentials on this devbox.
Topics are organised so you can jump straight to what you need.
`;
}

const INSTALL_ONELINER = `curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/install.sh | bash`;

function rotateGithubBlock(): string {
  return `### GitHub token

The token lives in \`~/.config/devbox/env\` as \`GH_TOKEN\` and is mirrored to
\`/etc/environment\` for non-interactive SSH sessions.

To rotate:

1. Open https://github.com/settings/personal-access-tokens and revoke the old
   \`devbox-<slug>\` token.
2. Delete the \`GH_TOKEN="…"\` line from \`~/.config/devbox/env\`.
3. Re-run the installer:

   \`\`\`
   ${INSTALL_ONELINER}
   \`\`\`

   The installer detects the missing token and walks you through minting a new
   one. All other answers are remembered.
`;
}

function rotateDopplerBlock(): string {
  return `### Doppler service token

The token lives in \`~/.config/devbox/env\` as \`DOPPLER_TOKEN\`.

To rotate:

1. Open https://dashboard.doppler.com → your project → branch config → Access
   tab. Revoke the old \`devbox-<slug>\` service token.
2. Delete the \`DOPPLER_TOKEN="…"\` line from \`~/.config/devbox/env\`.
3. Re-run the installer:

   \`\`\`
   ${INSTALL_ONELINER}
   \`\`\`

   Mint a new read-only token in the dashboard and paste it when prompted.
`;
}

function rotateInfisicalBlock(): string {
  return `### Infisical service token

The token lives in \`~/.config/devbox/env\` as \`INFISICAL_TOKEN\`.

To rotate:

1. Open https://app.infisical.com → your project → Access Control → Service
   Tokens. Revoke the old \`devbox-<slug>\` token.
2. Delete the \`INFISICAL_TOKEN="…"\` line from \`~/.config/devbox/env\`.
3. Re-run the installer:

   \`\`\`
   ${INSTALL_ONELINER}
   \`\`\`

   Mint a new Read service token and paste it when prompted.
`;
}

function rotateTokensSection(ctx: Ctx): string {
  const blocks: string[] = [rotateGithubBlock()];
  if (ctx.secretsManager === "doppler") blocks.push(rotateDopplerBlock());
  if (ctx.secretsManager === "infisical") blocks.push(rotateInfisicalBlock());
  return `## Rotate tokens\n\n${blocks.join("\n")}`;
}

const CLAUDE_CONFIG_SECTION = `## Edit Claude config

Settings live at \`~/.claude/settings.json\`. The installer writes a fresh file
on first install and never overwrites it on re-run, so your edits stick.

The denied list is the safety net for risky shell commands. By default it
blocks:

- \`git push --force\`, \`git push -f\`, \`git push --no-verify\`
- \`git reset --hard\`, \`git clean -fd\`
- \`npm publish\`
- Reads of \`.env\`, \`.env.*\`, and \`~/.config/devbox/env\`

In read-only git mode, \`git push\`, \`git commit\`, \`gh pr create\`, \`gh pr edit\`,
\`gh pr merge\`, and \`gh issue create\` are also blocked. In write mode without
direct-push-to-main, \`gh pr merge\` is blocked (the local pre-merge-commit hook
catches the local merge).

Edit \`settings.json\` directly to add or remove rules. Restart Claude Code
sessions to pick up the change.
`;

const CLAUDE_SKILLS_SECTION = `## Edit Claude skills

Skills live at \`~/.claude/skills/<name>/SKILL.md\`. Bundled with this devbox:

- \`code-review\` — find real problems in the current branch and write a report
- \`code-simplify\` — apply minimal-diff simplifications to the current branch
- \`code-manual-tests\` — produce a manual-test checklist for the current branch

Each is a plain markdown file. Edit it freely; the installer never overwrites
an existing skill on re-run.

To add a new skill, create \`~/.claude/skills/<name>/SKILL.md\` with a YAML
frontmatter block (\`name\`, \`description\`) and the body. Restart Claude Code
to pick it up.
`;

function gitPermissionsSection(ctx: Ctx): string {
  const cur = ctx.gitMode === "write" ? "**write**" : "**read-only**";
  const policy = ctx.gitMode === "write"
    ? `Push to default branch: ${ctx.gitWritePolicy.pushMain ? "allowed" : "blocked"}. Branch deletion: ${ctx.gitWritePolicy.deleteBranches ? "allowed" : "blocked"}.`
    : `Agent cannot commit, push, or open PRs. The PAT is read-scoped at the GitHub side as well.`;

  return `## Change git permissions (read vs. write)

Current mode: ${cur}.
${policy}

Fastest path to change this is to re-run the installer:

\`\`\`
${INSTALL_ONELINER}
\`\`\`

Pick the new mode at the "Should the agent be able to write to git" prompt.
The installer rewrites:

- the GitHub PAT scope (you will mint a new one with the right access),
- \`~/.claude/settings.json\` deny rules,
- \`~/<slug>/.git/hooks/pre-push\` and \`pre-merge-commit\`.

Manual alternative: edit \`~/.claude/settings.json\` deny list and the hook
files under \`~/<slug>/.git/hooks/\` directly. The hook scripts are short and
self-explanatory.
`;
}

function suggestedSection(ctx: Ctx): string {
  return `## Other handy things

### Reconnect to this devbox

\`\`\`
ssh devbox-${ctx.repo.slug}@orb
cd ~/${ctx.repo.slug}
\`\`\`

Orbstack auto-registers each VM under \`<machine>@orb\` on the host's ssh config.

### Re-run the installer

\`\`\`
${INSTALL_ONELINER}
\`\`\`

Re-runs are safe. The installer reuses validated tokens, skips already-cloned
repos, and never clobbers \`~/AGENTS.md\`, \`~/DEVBOX.md\`, \`~/.claude/settings.json\`,
or any installed skill.

### Where things live

- \`~/AGENTS.md\` — agent rules and per-project conventions (the 12 default
  rules ship here). \`~/.claude/CLAUDE.md\` imports it.
- \`~/.claude/settings.json\` — Claude Code settings and deny list.
- \`~/.claude/skills/\` — installed skills.
- \`~/.config/devbox/env\` — secrets (mode 0600). Sourced by every shell.
- \`~/.bashrc.d/devbox.sh\` — shell init that loads the env file and applies
  aliases.
- \`~/${ctx.repo.slug}/\` — the repo clone.

### Edit AGENTS.md or the 12 default rules

Edit \`~/AGENTS.md\` directly. Your edits stick across re-runs. To revert to
the shipped defaults, delete the file and re-run the installer.
`;
}

export function buildGuideMd(ctx: Ctx): string {
  return [
    header(ctx.repo),
    rotateTokensSection(ctx),
    CLAUDE_CONFIG_SECTION,
    CLAUDE_SKILLS_SECTION,
    gitPermissionsSection(ctx),
    suggestedSection(ctx),
  ].join("\n");
}

const tool: Tool = {
  id: "guide",
  label: "Devbox guide (~/DEVBOX.md)",
  default: true,
  required: true,
  async run(ctx) {
    const guidePath = path.join(home(), "DEVBOX.md");

    if (isDryRun()) {
      note("write", `${guidePath} (sections gated by installed tools; skipped if present)`);
      return;
    }

    if (!(await fileExists(guidePath))) {
      await fs.writeFile(guidePath, buildGuideMd(ctx));
    }
  },
};

export default tool;
