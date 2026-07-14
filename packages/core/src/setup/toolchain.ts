import type { Executor } from '../executor';
import type { Ctx, SetupStatus } from '../types';
import { run, runScript, shellQuote } from '../lib';

export type ToolchainOptions = {
  /** Install node LTS + set the fnm default alias when none exists (fresh hosts). */
  ensureDefaultNode?: boolean;
  /** Provision the repo's pinned node + corepack inside this directory. */
  provisionWorkdir?: string;
};

/**
 * Base runtime is always node (via fnm, so the repo's pinned version wins over
 * any system node). corepack — which provides pnpm AND yarn — is enabled when
 * either is selected. bun is a standalone install, only when selected.
 */
export async function setupToolchain(
  exec: Executor,
  ctx: Ctx,
  opts: ToolchainOptions = {},
): Promise<SetupStatus> {
  const installed: string[] = [];
  const reused: string[] = [];

  const hasFnm = (await run(exec, `test -x "$HOME/.local/share/fnm/fnm"`)).exitCode === 0;
  if (!hasFnm) {
    await runScript(exec, `curl -fsSL https://fnm.vercel.app/install | bash`);
    installed.push('fnm');
  } else {
    reused.push('fnm');
  }

  if (ctx.toolchain.includes('bun')) {
    const hasBun = (await run(exec, `test -x "$HOME/.bun/bin/bun"`)).exitCode === 0;
    if (!hasBun) {
      await runScript(exec, `curl -fsSL https://bun.sh/install | bash`);
      installed.push('bun');
    } else {
      reused.push('bun');
    }
  }

  const corepack =
    ctx.toolchain.includes('pnpm') || ctx.toolchain.includes('yarn') ? 'corepack enable' : '';

  if (opts.ensureDefaultNode) {
    const hasDefault =
      (await run(exec, `test -e "$HOME/.local/share/fnm/aliases/default"`)).exitCode === 0;
    if (!hasDefault) {
      await runScript(exec, [`fnm install --lts`, `fnm default lts-latest`, corepack || 'true'].join('\n'));
      installed.push('node');
    } else {
      if (corepack) await runScript(exec, corepack);
      reused.push('node');
    }
  }

  if (opts.provisionWorkdir) {
    await runScript(
      exec,
      [
        `cd ${shellQuote(opts.provisionWorkdir)}`,
        `fnm use --install-if-missing 2>/dev/null || (fnm install --lts && fnm use lts-latest)`,
        `fnm default "$(node -v)"`,
        corepack || 'true',
        // Safe cache prune — keeps tooling, trims footprint.
        `command -v pnpm >/dev/null 2>&1 && pnpm store prune >/dev/null 2>&1 || true`,
        `npm cache clean --force >/dev/null 2>&1 || true`,
        `sudo apt-get clean >/dev/null 2>&1 || true`,
      ].join('\n'),
    );
  }

  if (installed.length && reused.length) {
    return { kind: 'mixed', note: `installed ${installed.join(', ')}; reused ${reused.join(', ')}` };
  }
  if (installed.length) return { kind: 'installed', note: installed.join(', ') };
  return { kind: 'reused', note: reused.join(', ') || undefined };
}
