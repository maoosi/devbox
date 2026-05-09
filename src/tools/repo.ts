import * as fs from "node:fs/promises";
import * as path from "node:path";
import { run } from "../exec.ts";
import { home } from "../env.ts";
import { isDryRun, note } from "../dryrun.ts";
import type { Tool, GitWritePolicy } from "./index.ts";

// One devbox = one repo. The clone lives at ~/<slug> where <slug> is the repo
// name from the GitHub URL — recognisable per-project (~/devbox, ~/Hello-World)
// instead of a generic ~/repo across every box.
export function cloneDir(slug: string): string { return path.join(home(), slug); }
export function cloneDirDisplay(slug: string): string { return `~/${slug}`; }

// Pre-push hook script. The default-branch name is resolved at run time so
// "main" / "master" / "trunk" are all handled. Sentinel SHA = branch deletion.
export function prePushHook(policy: GitWritePolicy): string {
  return `#!/bin/sh
# Installed by devbox install. Reflects this devbox's git policy.
# Bypassing requires \`--no-verify\`, which is denied at the agent layer
# (when an agent CLI like Claude Code is installed).
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

// Local-merge counterpart to prePushHook. Refuses any merge commit created
// while HEAD is the default branch when pushMain=false. Catches
// `git checkout main && git merge feature` (non-FF). FF merges create no
// commit and don't fire this hook — those are still caught at push time by
// prePushHook (which blocks every push to the default branch).
export function preMergeCommitHook(policy: GitWritePolicy): string {
  return `#!/bin/sh
# Installed by devbox install. Reflects this devbox's git policy.
# Bypassing requires \`--no-verify\`, which is denied at the agent layer.
ALLOW_MAIN=${policy.pushMain ? 1 : 0}
DEFAULT_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')"
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=main
CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null)"
if [ "$CURRENT_BRANCH" = "$DEFAULT_BRANCH" ] && [ "$ALLOW_MAIN" = "0" ]; then
  echo "blocked: merging into $DEFAULT_BRANCH is disabled by devbox policy" >&2
  exit 1
fi
exit 0
`;
}

// Hook is only meaningful in write mode AND only when at least one restriction
// applies. Read-only mode relies on the PAT scope (server-side) — installing a
// hook there would just inconvenience the human if they ever pushed manually.
export function shouldInstallHook(
  gitMode: "read-only" | "write",
  policy: GitWritePolicy,
): boolean {
  if (gitMode !== "write") return false;
  return !(policy.pushMain && policy.deleteBranches);
}

const tool: Tool = {
  id: "repo",
  label: "Clone repo",
  default: true,
  required: true,
  async run(ctx) {
    const target = cloneDir(ctx.repo.slug);
    const prePushPath = path.join(target, ".git", "hooks", "pre-push");
    const preMergePath = path.join(target, ".git", "hooks", "pre-merge-commit");
    const installHook = shouldInstallHook(ctx.gitMode, ctx.gitWritePolicy);

    // Skip the clone if the target already exists. Re-runs with a different
    // repo URL are not handled — the user can rm -rf the folder and re-run.
    let alreadyCloned = false;
    try {
      await fs.access(target);
      alreadyCloned = true;
    } catch {
      /* fresh */
    }

    // `git` ignores GH_TOKEN — it's a `gh` CLI variable. Without a credential
    // helper, the clone falls back to prompting for a username and aborts under
    // GIT_TERMINAL_PROMPT=0. `gh auth setup-git` writes a global credential
    // helper that delegates to `gh auth git-credential`, which honors GH_TOKEN.
    // This also makes future `git push` / `fetch` work in any shell that has
    // GH_TOKEN exported (which ~/.config/devbox/env provides). Idempotent —
    // re-runs just rewrite the same helper line.
    await run("gh", ["auth", "setup-git"], {
      env: { GH_TOKEN: ctx.tokens.GH_TOKEN },
      quiet: true,
    });

    if (isDryRun()) {
      if (alreadyCloned) note("skip clone", `${target} already exists`);
      else note("clone", `${ctx.repo.url} → ${target}`);
      if (installHook) {
        note("write", `${prePushPath} (chmod +x; allowMain=${ctx.gitWritePolicy.pushMain}, allowDelete=${ctx.gitWritePolicy.deleteBranches})`);
        note("write", `${preMergePath} (chmod +x; allowMain=${ctx.gitWritePolicy.pushMain})`);
      }
      return;
    }
    if (!alreadyCloned) {
      await fs.mkdir(home(), { recursive: true });
      await run("git", ["clone", ctx.repo.url, target], {
        env: { GH_TOKEN: ctx.tokens.GH_TOKEN, GIT_TERMINAL_PROMPT: "0" },
      });
    }

    // Always (re)write the hooks — policy may have changed across runs and the
    // files are managed artifacts.
    if (installHook) {
      await fs.writeFile(prePushPath, prePushHook(ctx.gitWritePolicy), { mode: 0o755 });
      await fs.writeFile(preMergePath, preMergeCommitHook(ctx.gitWritePolicy), { mode: 0o755 });
    }
  },
};

export default tool;
