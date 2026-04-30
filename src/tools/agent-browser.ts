import { has, sh } from "../exec.ts";
import type { Tool } from "./index.ts";

const tool: Tool = {
  id: "agent-browser",
  label: "agent-browser (headless browser for agents)",
  default: true,
  required: false,
  async run() {
    // `agent-browser install --with-deps` re-downloads browser binaries every
    // time. Skip the whole step when the CLI is already on PATH.
    if (await has("agent-browser")) return;
    await sh("npm install -g agent-browser", { quiet: true });
    await sh("agent-browser install --with-deps", { quiet: true });
  },
};

export default tool;
