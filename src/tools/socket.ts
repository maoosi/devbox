import { sh } from "../exec.ts";
import type { Tool } from "./index.ts";

// Socket Firewall (sfw) wraps npm/pnpm/yarn/pip/uv/cargo and blocks known-malicious
// packages at install. Bun is not yet supported.
const tool: Tool = {
  id: "socket",
  label: "Socket Firewall (npm/pnpm/pip/cargo)",
  default: true,
  required: false,
  async run(ctx) {
    await sh("npm install -g sfw", { quiet: true });
    ctx.aliases.push(
      `alias npm="sfw npm"`,
      `alias pnpm="sfw pnpm"`,
      `alias yarn="sfw yarn"`,
      `alias pip="sfw pip"`,
      `alias uv="sfw uv"`,
      `alias cargo="sfw cargo"`,
    );
  },
};

export default tool;
