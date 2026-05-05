import * as p from "@clack/prompts";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { home } from "../env.ts";
import { has, sh } from "../exec.ts";
import type { Tool } from "./index.ts";

// `agent-browser install` exits immediately on Linux ARM64 (Chrome for Testing
// has no aarch64 builds — see vercel-labs/agent-browser cli/src/install.rs),
// so on that arch we install Playwright's Chromium instead. agent-browser's
// runtime auto-detects ~/.cache/ms-playwright/ (cli/src/native/cdp/chrome.rs).
const isLinuxArm64 = process.platform === "linux" && process.arch === "arm64";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Returns true when ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome
// already exists — used to keep re-runs as a no-op.
async function chromiumAlreadyInstalled(): Promise<boolean> {
  const cacheDir = path.join(home(), ".cache", "ms-playwright");
  if (!(await exists(cacheDir))) return false;
  const entries = await fs.readdir(cacheDir).catch(() => [] as string[]);
  for (const e of entries) {
    if (!e.startsWith("chromium-")) continue;
    // Layout varies slightly across playwright versions: chrome-linux/chrome
    // (older) or chrome-linux-arm64/chrome (newer). Probe both.
    for (const sub of ["chrome-linux", "chrome-linux-arm64"]) {
      if (await exists(path.join(cacheDir, e, sub, "chrome"))) return true;
    }
  }
  return false;
}

const tool: Tool = {
  id: "agent-browser",
  label: "agent-browser (headless browser for agents)",
  default: true,
  required: false,
  async run() {
    if (!(await has("agent-browser"))) {
      await sh("npm install -g agent-browser", { quiet: true });
    }

    // DEVBOX_SKIP_BROWSER_DEPS lets smoke tests skip the ~150MB Chromium
    // download, exercising the CLI install without paying the download cost.
    if (process.env.DEVBOX_SKIP_BROWSER_DEPS === "1") {
      p.log.info("Skipping browser-binary install (DEVBOX_SKIP_BROWSER_DEPS).");
      return;
    }

    if (isLinuxArm64) {
      if (await chromiumAlreadyInstalled()) {
        p.log.info("Skipping Playwright Chromium — already installed.");
        return;
      }
      // Install Playwright globally and use it to provision Chromium. Playwright
      // ships official Linux ARM64 Chromium builds; agent-browser auto-detects
      // them at runtime, no executable-path or env var needed.
      await sh("npm install -g playwright", { quiet: true });
      // `playwright install-deps` runs apt-get under the hood. On Linux it must
      // be invoked with sudo (the apt-get call inside fails otherwise). We resolve
      // the Playwright CLI script via `npm root -g` so sudo finds it without PATH.
      await sh(
        'sudo "$(command -v node)" "$(npm root -g)/playwright/cli.js" install-deps chromium',
        { quiet: true },
      );
      await sh("npx --yes playwright install chromium", { quiet: true });
      return;
    }

    await sh("agent-browser install --with-deps", { quiet: true });
  },
};

export default tool;
