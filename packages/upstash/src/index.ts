/**
 * devbox config DSL — the package's public API, imported by project `devbox.ts`
 * files. Everything here is a pure data constructor (like Vite's defineConfig);
 * all side effects live in the CLI (`src/cli.ts` + `src/commands/*`).
 */

export type ToolchainTool = 'bun' | 'pnpm' | 'yarn' | 'pulumi' | 'vite-plus' | 'agent-browser';

export type ToolchainItem = { kind: 'toolchain'; tool: ToolchainTool };

export type SecretProvider = {
  kind: 'secret';
  provider: 'infisical' | 'doppler';
  token: string;
};

export type SetupStep =
  | { kind: 'setup'; step: 'command'; command: string; cwd?: string }
  | { kind: 'setup'; step: 'pulumi-install'; cwd?: string; noDependencies?: boolean };

export type Editor = 'zed' | 'code';

export type DevboxConfig = {
  /** Project name (`[a-z0-9-]+`) — boxes are named `devbox-{name}[-{workspace}]`. */
  name: string;
  repository: {
    /** GitHub slug, `owner/repo`. */
    slug: string;
    /** Branch cloned into the base box. Default: `main`. */
    branch?: string;
    /**
     * GitHub token used to clone the repo, exported as GH_TOKEN on the box,
     * and wired into the GitHub MCP server. Omit for public repos (MCP is
     * then skipped). Typically `process.env.GITHUB_TOKEN` — put the value in
     * `devbox.local.env` next to this file.
     */
    token?: string;
  };
  /** Directory the repo is cloned into (under /workspace). Default: repo name. */
  workdir?: string;
  /** Git mode for safety hooks + agent guardrails. Default: `write`. */
  mode?: 'write' | 'read-only';
  /**
   * What write mode may still do. Defaults to the strict policy (no direct
   * pushes/merges to the default branch, no branch deletion). Ignored in
   * read-only mode.
   */
  writePolicy?: { pushMain?: boolean; deleteBranches?: boolean };
  toolchain?: ToolchainItem[];
  secrets?: SecretProvider[];
  /** One-time setup steps, run in `workdir` after clone + toolchain. */
  setup?: SetupStep[];
  /** Default editor for `devbox open`. Default: `zed`. */
  editor?: Editor;
};

/** Define a devbox project configuration (identity function, for types + DX). */
export function devbox(config: DevboxConfig): DevboxConfig {
  return config;
}

export const bun = (): ToolchainItem => ({ kind: 'toolchain', tool: 'bun' });
export const pnpm = (): ToolchainItem => ({ kind: 'toolchain', tool: 'pnpm' });
export const yarn = (): ToolchainItem => ({ kind: 'toolchain', tool: 'yarn' });
/** Vite+ (unified JS toolchain) — installed on the box when selected. */
export const vitePlus = (): ToolchainItem => ({ kind: 'toolchain', tool: 'vite-plus' });
/** agent-browser + Chromium (~150MB, baked into the base snapshot) when selected. */
export const agentBrowser = (): ToolchainItem => ({ kind: 'toolchain', tool: 'agent-browser' });

/**
 * Pulumi is both a toolchain item (`pulumi()` installs the CLI) and a setup-step
 * factory (`pulumi.install({...})` runs `pulumi install` in the given directory).
 */
export const pulumi = Object.assign(
  (): ToolchainItem => ({ kind: 'toolchain', tool: 'pulumi' }),
  {
    install: (opts: { cwd?: string; noDependencies?: boolean } = {}): SetupStep => ({
      kind: 'setup',
      step: 'pulumi-install',
      cwd: opts.cwd,
      noDependencies: opts.noDependencies,
    }),
  },
);

export const infisical = (opts: { token: string }): SecretProvider => ({
  kind: 'secret',
  provider: 'infisical',
  token: opts.token,
});

export const doppler = (opts: { token: string }): SecretProvider => ({
  kind: 'secret',
  provider: 'doppler',
  token: opts.token,
});

/** Run an arbitrary shell command as a setup step (in `workdir`, or `opts.cwd` under it). */
export const command = (cmd: string, opts: { cwd?: string } = {}): SetupStep => ({
  kind: 'setup',
  step: 'command',
  command: cmd,
  cwd: opts.cwd,
});
