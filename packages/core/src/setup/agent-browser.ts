import type { Executor } from '../executor';
import type { SetupStatus } from '../types';
import { ENV_PREAMBLE, run, runScript } from '../lib';

export type AgentBrowserOptions = {
  /** Skip the ~150MB Chromium download (smoke tests exercise the CLI install only). */
  skipBrowserDeps?: boolean;
};

// Non-throwing probe that still sees the devbox toolchain (npm-global bins
// live in fnm's default-alias bin dir, which only ENV_PREAMBLE puts on PATH).
async function probe(exec: Executor, script: string): Promise<boolean> {
  return (await run(exec, `${ENV_PREAMBLE}\n${script}`)).exitCode === 0;
}

/**
 * Install agent-browser (headless browser for agents).
 *
 * `agent-browser install` exits immediately on Linux ARM64 (Chrome for Testing
 * has no aarch64 builds — see vercel-labs/agent-browser cli/src/install.rs),
 * so on that arch we install Playwright's Chromium instead. agent-browser's
 * runtime auto-detects ~/.cache/ms-playwright/ (cli/src/native/cdp/chrome.rs).
 * Platform is probed on the TARGET machine, not the machine running this code.
 */
export async function setupAgentBrowser(
  exec: Executor,
  opts: AgentBrowserOptions = {},
): Promise<SetupStatus> {
  const cliPresent = await probe(exec, `command -v agent-browser >/dev/null 2>&1`);
  if (!cliPresent) {
    await runScript(exec, `npm install -g agent-browser`);
  }

  if (opts.skipBrowserDeps) {
    const note = cliPresent
      ? 'CLI reused; Chromium download skipped'
      : 'CLI installed; Chromium download skipped';
    return cliPresent ? { kind: 'reused', note } : { kind: 'installed', note };
  }

  const isLinuxArm64 = (await run(exec, `test "$(uname -sm)" = "Linux aarch64"`)).exitCode === 0;

  if (isLinuxArm64) {
    // Layout varies slightly across playwright versions: chrome-linux/chrome
    // (older) or chrome-linux-arm64/chrome (newer) — the glob covers both.
    const chromiumPresent =
      (
        await run(
          exec,
          `ls "$HOME/.cache/ms-playwright"/chromium-*/chrome-linux*/chrome >/dev/null 2>&1`,
        )
      ).exitCode === 0;
    if (chromiumPresent) {
      return cliPresent
        ? { kind: 'reused', note: 'CLI + Chromium already installed' }
        : { kind: 'mixed', note: 'CLI installed; Chromium reused' };
    }
    // Install Playwright globally and use it to provision Chromium. Playwright
    // ships official Linux ARM64 Chromium builds. `playwright install-deps`
    // runs apt-get under the hood and must be invoked with sudo; resolve the
    // CLI script via `npm root -g` so sudo finds it without PATH.
    await runScript(exec, `npm install -g playwright`);
    await runScript(
      exec,
      `sudo "$(command -v node)" "$(npm root -g)/playwright/cli.js" install-deps chromium`,
    );
    await runScript(exec, `npx --yes playwright install chromium`);
    return cliPresent
      ? { kind: 'mixed', note: 'CLI reused; Chromium installed' }
      : { kind: 'installed', note: 'CLI + Chromium' };
  }

  await runScript(exec, `agent-browser install --with-deps`);
  return cliPresent
    ? { kind: 'mixed', note: 'CLI reused; ran agent-browser install --with-deps' }
    : { kind: 'installed' };
}
