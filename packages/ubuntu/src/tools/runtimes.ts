import * as path from "node:path";
import { setupToolchain } from "@devbox/core";
import { home } from "../env.ts";
import { LocalExecutor } from "../executor.ts";
import { toCoreCtx } from "../core-ctx.ts";
import type { Tool, ToolStatus } from "./index.ts";

const tool: Tool = {
  id: "runtimes",
  label: "Node + pnpm + Bun",
  default: true,
  required: true,
  async run(ctx): Promise<ToolStatus> {
    // fnm + node LTS + bun via core; pnpm/yarn come from corepack (enabled by
    // setupToolchain), shimmed into the fnm default node's bin dir.
    const status = await setupToolchain(new LocalExecutor(), toCoreCtx(ctx), {
      ensureDefaultNode: true,
    });

    ctx.exports.push(
      `export PATH="$HOME/.bun/bin:$PATH"`,
      `[ -d "$HOME/.local/share/fnm" ] && export PATH="$HOME/.local/share/fnm:$PATH" && eval "$(fnm env --shell bash)"`,
    );

    // Update the running process's PATH so later tools (socket, claude,
    // agent-browser …) can spawn npm/node/pnpm directly. Without this, the
    // just-installed binaries are only discoverable after a shell restart
    // since ctx.exports is written to ~/.bashrc.d/devbox.sh after the install
    // loop finishes. (Core's runScript carries its own ENV_PREAMBLE — this is
    // for the tools that still spawn commands directly.)
    const h = home();
    const extra = [
      path.join(h, ".bun", "bin"),
      path.join(h, ".local", "share", "fnm"),
      // node/npm/npx + corepack-shimmed pnpm/yarn live in the default alias bin.
      path.join(h, ".local", "share", "fnm", "aliases", "default", "bin"),
    ];
    process.env.PATH = `${extra.join(":")}:${process.env.PATH ?? ""}`;

    return status;
  },
};

export default tool;
