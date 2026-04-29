import { sh } from "../exec.ts";
import type { Tool } from "./index.ts";

const tool: Tool = {
  id: "runtimes",
  label: "Node + pnpm + Bun",
  default: true,
  required: true,
  async run(ctx) {
    await sh("curl -fsSL https://bun.sh/install | bash", { quiet: true });
    await sh("curl -fsSL https://fnm.vercel.app/install | bash", { quiet: true });
    await sh(
      `eval "$($HOME/.local/share/fnm/fnm env --shell bash)" && $HOME/.local/share/fnm/fnm install --lts && $HOME/.local/share/fnm/fnm default lts-latest`,
      { quiet: true },
    );
    await sh("curl -fsSL https://get.pnpm.io/install.sh | sh -", { quiet: true });

    ctx.exports.push(
      `export PATH="$HOME/.bun/bin:$PATH"`,
      `export PNPM_HOME="$HOME/.local/share/pnpm"`,
      `export PATH="$PNPM_HOME:$PATH"`,
      `[ -d "$HOME/.local/share/fnm" ] && export PATH="$HOME/.local/share/fnm:$PATH" && eval "$(fnm env --shell bash)"`,
    );
  },
};

export default tool;
