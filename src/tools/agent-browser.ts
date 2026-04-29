import { sh } from "../exec.ts";
import type { Tool } from "./index.ts";

const tool: Tool = {
  id: "agent-browser",
  label: "agent-browser (UI/console for agents)",
  default: true,
  required: false,
  async run() {
    await sh("npm install -g agent-browser", { quiet: true });
    await sh("agent-browser install --with-deps", { quiet: true });
  },
};

export default tool;
