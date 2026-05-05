import * as p from "@clack/prompts";
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
    // DEVBOX_SKIP_BROWSER_DEPS lets smoke tests skip the ~300MB browser-binary
    // download (which has no Linux/ARM64 build), exercising the CLI install
    // without paying the download cost.
    if (process.env.DEVBOX_SKIP_BROWSER_DEPS === "1") {
      p.log.info("Skipping `agent-browser install --with-deps` (DEVBOX_SKIP_BROWSER_DEPS).");
      return;
    }
    await sh("agent-browser install --with-deps", { quiet: true });
  },
};

export default tool;
