import { setupSocket } from "@devbox/core";
import { LocalExecutor } from "../executor.ts";
import type { Tool } from "./index.ts";

// Socket Firewall (sfw) wraps install-like subcommands of npm/pnpm/yarn/pip/uv/cargo
// and blocks known-malicious packages at install. The shell-function wrappers land
// in ~/.config/devbox/aliases.sh (sourced from ~/.bashrc) — see @devbox/core.
const tool: Tool = {
  id: "socket",
  label: "Socket Firewall (blocks malicious packages)",
  default: true,
  required: false,
  async run() {
    return setupSocket(new LocalExecutor());
  },
};

export default tool;
