import { setupAgentBrowser } from "@devbox/core";
import { LocalExecutor } from "../executor.ts";
import type { Tool } from "./index.ts";

// DEVBOX_SKIP_BROWSER_DEPS lets smoke tests skip the ~150MB Chromium
// download, exercising the CLI install without paying the download cost.
const tool: Tool = {
  id: "agent-browser",
  label: "agent-browser (headless browser for agents)",
  default: true,
  required: false,
  async run() {
    return setupAgentBrowser(new LocalExecutor(), {
      skipBrowserDeps: process.env.DEVBOX_SKIP_BROWSER_DEPS === "1",
    });
  },
};

export default tool;
