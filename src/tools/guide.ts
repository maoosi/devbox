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

Stored as \`GH_TOKEN\` in \`~/.config/devbox/env\` and mirrored to
\`/etc/environment\` for non-interactive SSH sessions.

1. Revoke the old \`devbox-<slug>\` token at
   https://github.com/settings/personal-access-tokens.
2. Delete the \`GH_TOKEN="…"\` line from \`~/.config/devbox/env\`.
3. Re-run the installer:

   \`\`\`
   ${INSTALL_ONELINER}
   \`\`\`

   With no \`GH_TOKEN\` line to reuse, the installer falls through to the same
   paste-a-new-token prompt you saw on first install. Every other answer is
   remembered.
`;
}

function rotateDopplerBlock(): string {
  return `### Doppler service token

Stored as \`DOPPLER_TOKEN\` in \`~/.config/devbox/env\`.

1. Revoke the old \`devbox-<slug>\` service token at
   https://dashboard.doppler.com → your project → branch config → Access tab.
2. Delete the \`DOPPLER_TOKEN="…"\` line from \`~/.config/devbox/env\`.
3. Re-run the installer:

   \`\`\`
   ${INSTALL_ONELINER}
   \`\`\`

   With no \`DOPPLER_TOKEN\` line to reuse, the installer falls through to the
   paste prompt. Mint a new read-only token in the dashboard and paste it.
`;
}

function rotateInfisicalBlock(): string {
  return `### Infisical service token

Stored as \`INFISICAL_TOKEN\` in \`~/.config/devbox/env\`.

1. Revoke the old \`devbox-<slug>\` token at https://app.infisical.com →
   your project → Access Control → Service Tokens.
2. Delete the \`INFISICAL_TOKEN="…"\` line from \`~/.config/devbox/env\`.
   Required even if you also revoked it. The installer does not validate
   Infisical tokens against the API, so a revoked-but-present token will be
   reused.
3. Re-run the installer:

   \`\`\`
   ${INSTALL_ONELINER}
   \`\`\`

   With no \`INFISICAL_TOKEN\` line to reuse, the installer falls through to
   the paste prompt. Mint a new Read service token and paste it.
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

Non-git deny rules in the default config:

- \`npm publish\`
- Reads of \`.env\`, \`.env.*\`, and \`~/.config/devbox/env\` (token leakage guard)

Git-related deny rules are documented in **Git permissions** below — change
those by switching git mode rather than editing them by hand, so the deny
list and the git hooks stay in sync.

Edit \`settings.json\` directly to add other rules. Restart Claude Code
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

  return `## Git permissions

Current mode: ${cur}.
${policy}

Two layers enforce this:

1. **Claude deny rules** (\`~/.claude/settings.json\`) stop the agent from
   running risky git commands.
2. **Local git hooks** (\`~/${ctx.repo.slug}/.git/hooks/\`) stop the same
   commands when run by hand or by another tool.

### Claude deny rules (always on)

- \`git push --force\`, \`git push -f\`, \`git push --no-verify\`
- \`git reset --hard\`, \`git clean -fd\`

### Claude deny rules in read-only mode

- \`git push\`, \`git commit\`
- \`gh pr create\`, \`gh pr edit\`, \`gh pr merge\`, \`gh issue create\`

### Claude deny rules in write mode without direct-push-to-main

- \`gh pr merge\` (server-side merge that bypasses the local hook)

### Local git hooks

- \`pre-push\` blocks pushes to the default branch and branch deletions when
  policy disallows them.
- \`pre-merge-commit\` blocks merges into the default branch when policy
  disallows direct push to main.

### Change the mode

Re-run the installer:

\`\`\`
${INSTALL_ONELINER}
\`\`\`

Pick the new mode at the "Should the agent be able to write to git" prompt.
The installer:

- re-prompts for a GitHub PAT with the new scope (revoke the old one in the
  GitHub UI first, then delete the \`GH_TOKEN="…"\` line from
  \`~/.config/devbox/env\` so the installer falls through to the prompt),
- rewrites the two hook files at \`~/${ctx.repo.slug}/.git/hooks/\`.

It does **not** rewrite \`~/.claude/settings.json\` if the file is already
there (your hand-edits stay safe). To pick up the new mode's deny rules,
delete \`~/.claude/settings.json\` and re-run, or edit the deny list by hand
to match the lists in this section. The installer surfaces a drift warning
when the on-disk settings no longer match the chosen mode.

If you do edit by hand, both the Claude settings and the hook files are short
and self-explanatory.
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
or any installed skill. The end-of-run summary groups tools into **installed**
(work happened) and **reused** (existing state preserved, no-op) so you can
see what your re-run actually changed. If a managed file on disk no longer
matches what the current install would write (e.g. you switched git mode but
\`settings.json\` is still the old mode), the installer prints a drift
warning pointing back here.

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
  async run(ctx): Promise<ToolStatus> {
    const guidePath = path.join(home(), "DEVBOX.md");

    if (isDryRun()) {
      note("write", `${guidePath} (sections gated by installed tools; skipped if present)`);
      return { kind: "installed" };
    }

    const target = buildGuideMd(ctx);
    if (await fileExists(guidePath)) {
      // Drift check: if the user changed git mode or secrets manager on
      // re-run, the guide on disk no longer matches reality. Warn loudly.
      const { stale } = await detectDrift(guidePath, target);
      if (stale) warnDrift(guidePath);
      return { kind: "reused", note: "~/DEVBOX.md already present" };
    }
    await fs.writeFile(guidePath, target);
    return { kind: "installed" };
  },
};

export default tool;
