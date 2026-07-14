import type { Ctx as CoreCtx } from "@devbox/core";
import type { Ctx } from "./tools/index.ts";
import { cloneDir } from "./tools/repo.ts";

// Project the wizard-shaped installer Ctx onto the core setup-module Ctx.
// The ubuntu installer always provisions bun + node/pnpm (runtimes is a
// required tool), so the core toolchain list is fixed.
export function toCoreCtx(ctx: Ctx): CoreCtx {
  return {
    workdir: cloneDir(ctx.repo.slug),
    gitMode: ctx.gitMode,
    gitWritePolicy: ctx.gitWritePolicy,
    toolchain: ["bun", "pnpm"],
    secrets: ctx.secretsManager === "none" ? [] : [ctx.secretsManager],
    githubToken: ctx.tokens.GH_TOKEN ?? "",
  };
}
