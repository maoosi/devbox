import * as fs from "node:fs/promises";
import * as path from "node:path";
import { run } from "../exec.ts";
import { isDryRun, note } from "../dryrun.ts";
import type { Tool, GitWritePolicy } from "./index.ts";

// Pre-push hook script. The default-branch name is resolved at run time so
// "main" / "master" / "trunk" are all handled. Sentinel SHA = branch deletion.
function prePushHook(policy: GitWritePolicy): string {
  return `#!/bin/sh
# Installed by devbox install. Reflects this devbox's git policy.
# Bypassing requires \`--no-verify\`, which is denied at the Claude layer.
ALLOW_MAIN=${policy.pushMain ? 1 : 0}
ALLOW_DELETE=${policy.deleteBranches ? 1 : 0}
DEFAULT_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')"
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=main
ZERO=0000000000000000000000000000000000000000
while read local_ref local_sha remote_ref remote_sha; do
  branch=\${remote_ref#refs/heads/}
  if [ "$local_sha" = "$ZERO" ] && [ "$ALLOW_DELETE" = "0" ]; then
    echo "blocked: branch deletion is disabled by devbox policy" >&2
    exit 1
  fi
  if [ "$branch" = "$DEFAULT_BRANCH" ] && [ "$ALLOW_MAIN" = "0" ]; then
    echo "blocked: direct push to $DEFAULT_BRANCH is disabled by devbox policy" >&2
    exit 1
  fi
done
exit 0
`;
}

// Hook is only meaningful in write mode AND only when at least one restriction
// applies. Read-only mode relies on the PAT scope (server-side) — installing a
// hook there would just inconvenience the human if they ever pushed manually.
function shouldInstallHook(
  gitMode: "read-only" | "write",
  policy: GitWritePolicy,
): boolean {
  if (gitMode !== "write") return false;
  return !(policy.pushMain && policy.deleteBranches);
}

const tool: Tool = {
  id: "repo",
  label: "Clone repo + per-project CLAUDE.md",
  default: true,
  required: true,
  async run(ctx) {
    const target = `/home/devbox/repos/${ctx.repo.slug}`;
    const claudeMd = path.join(target, "CLAUDE.md");
    const hookPath = path.join(target, ".git", "hooks", "pre-push");
    const installHook = shouldInstallHook(ctx.gitMode, ctx.gitWritePolicy);

    if (isDryRun()) {
      note("clone", `${ctx.repo.url} → ${target}`);
      note("write", `${claudeMd} (per-project template, if absent)`);
      if (installHook) {
        note("write", `${hookPath} (chmod +x; allowMain=${ctx.gitWritePolicy.pushMain}, allowDelete=${ctx.gitWritePolicy.deleteBranches})`);
      }
      return;
    }
    await fs.mkdir("/home/devbox/repos", { recursive: true });
    await run("git", ["clone", ctx.repo.url, target], {
      env: { GH_TOKEN: ctx.tokens.GH_TOKEN, GIT_TERMINAL_PROMPT: "0" },
    });

    // Drop a per-project CLAUDE.md only if the repo doesn't ship one.
    let wroteClaudeMd = false;
    try {
      await fs.access(claudeMd);
    } catch {
      const candidates = [
        path.resolve("templates/CLAUDE.md.tmpl"),
        path.resolve(import.meta.dir, "..", "..", "templates", "CLAUDE.md.tmpl"),
      ];
      for (const c of candidates) {
        try {
          const tmpl = await fs.readFile(c, "utf8");
          const filled = tmpl
            .replace(/\{\{REPO\}\}/g, `${ctx.repo.owner}/${ctx.repo.name}`)
            .replace(/\{\{SLUG\}\}/g, ctx.repo.slug);
          await fs.writeFile(claudeMd, filled);
          wroteClaudeMd = true;
          break;
        } catch {
          /* try next */
        }
      }
    }
    void wroteClaudeMd;

    if (installHook) {
      await fs.writeFile(hookPath, prePushHook(ctx.gitWritePolicy), { mode: 0o755 });
    }
  },
};

export default tool;
