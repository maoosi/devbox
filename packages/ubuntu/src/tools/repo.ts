import * as fs from "node:fs/promises";
import * as path from "node:path";
import { preMergeCommitHook, prePushHook, setupToolchain, shouldInstallHook } from "@devbox/core";
import { run } from "../exec.ts";
import { home } from "../env.ts";
import { LocalExecutor } from "../executor.ts";
import { toCoreCtx } from "../core-ctx.ts";
import type { Tool, ToolStatus } from "./index.ts";

// One devbox = one repo. The clone lives at ~/<slug> where <slug> is the repo
// name from the GitHub URL — recognisable per-project (~/devbox, ~/Hello-World)
// instead of a generic ~/repo across every box.
export function cloneDir(slug: string): string {
  return path.join(home(), slug);
}
export function cloneDirDisplay(slug: string): string {
  return `~/${slug}`;
}

const tool: Tool = {
  id: "repo",
  label: "Clone repo",
  default: true,
  required: true,
  async run(ctx): Promise<ToolStatus> {
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

    // Provision the repo's pinned node (via .node-version/.nvmrc when present,
    // LTS fallback) and enable corepack inside the clone — same behavior as an
    // upstash box workdir.
    await setupToolchain(new LocalExecutor(), toCoreCtx(ctx), { provisionWorkdir: target });

    if (alreadyCloned) {
      return installHook
        ? { kind: "mixed", note: "clone reused; hooks rewritten" }
        : { kind: "reused", note: "clone already present" };
    }
    return { kind: "installed", note: installHook ? "cloned + hooks written" : "cloned" };
  },
};

export default tool;
