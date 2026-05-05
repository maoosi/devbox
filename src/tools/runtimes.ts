import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sh } from "../exec.ts";
import { home } from "../env.ts";
import type { Tool } from "./index.ts";

// Probe by install-marker directory rather than `command -v`. Each upstream
// installer (bun, fnm, pnpm) appends a PATH/init block to ~/.bashrc on every
// run — re-running them piles up duplicates. The marker check is the source
// of truth for "did our installer's side-effect already happen?".
async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const tool: Tool = {
  id: "runtimes",
  label: "Node + pnpm + Bun",
  default: true,
  required: true,
  async run(ctx) {
    if (!(await exists(path.join(home(), ".bun")))) {
      await sh("curl -fsSL https://bun.sh/install | bash", { quiet: true });
    }
    if (!(await exists(path.join(home(), ".local", "share", "fnm")))) {
      await sh("curl -fsSL https://fnm.vercel.app/install | bash", { quiet: true });
      await sh(
        `eval "$($HOME/.local/share/fnm/fnm env --shell bash)" && $HOME/.local/share/fnm/fnm install --lts && $HOME/.local/share/fnm/fnm default lts-latest`,
        { quiet: true },
      );
    }
    if (!(await exists(path.join(home(), ".local", "share", "pnpm")))) {
      // Use `bash`, not `sh -`: on Ubuntu /bin/sh is dash, and pnpm's shell
      // detection introspects the parent process — running under dash makes
      // the post-install configuration step fail with ERR_PNPM_UNKNOWN_SHELL.
      await sh("curl -fsSL https://get.pnpm.io/install.sh | bash", { quiet: true });
    }

    ctx.exports.push(
      `export PATH="$HOME/.bun/bin:$PATH"`,
      `export PNPM_HOME="$HOME/.local/share/pnpm"`,
      `export PATH="$PNPM_HOME:$PATH"`,
      `[ -d "$HOME/.local/share/fnm" ] && export PATH="$HOME/.local/share/fnm:$PATH" && eval "$(fnm env --shell bash)"`,
    );

    // Update the running process's PATH so later tools (ignore-scripts,
    // socket, claude, agent-browser …) can spawn npm/node/pnpm directly.
    // Without this, the just-installed binaries are only discoverable after a
    // shell restart since ctx.exports is written to ~/.bashrc.d/devbox.sh
    // after the install loop finishes.
    const h = home();
    const fnmShim = path.join(h, ".local", "share", "fnm", "aliases", "default", "bin");
    process.env.PNPM_HOME = path.join(h, ".local", "share", "pnpm");
    const extra = [
      path.join(h, ".bun", "bin"),
      process.env.PNPM_HOME,
      path.join(h, ".local", "share", "fnm"),
      fnmShim,
    ];
    process.env.PATH = `${extra.join(":")}:${process.env.PATH ?? ""}`;
  },
};

export default tool;
