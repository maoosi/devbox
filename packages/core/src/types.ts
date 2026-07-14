export type GitMode = 'write' | 'read-only';

/** What a write-mode devbox is allowed to do against the remote. */
export type GitWritePolicy = { pushMain: boolean; deleteBranches: boolean };

export type Toolchain = 'bun' | 'pnpm' | 'yarn' | 'pulumi' | 'vite-plus' | 'agent-browser';
export type SecretManager = 'infisical' | 'doppler';

/**
 * Outcome of a setup module run. Modules never print — each package's own UI
 * (clack spinner, provision log lines) decides how to surface this.
 */
export type SetupStatus = { kind: 'installed' | 'reused' | 'mixed'; note?: string };

export type McpServer = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

/** Resolved, defaulted config shared with every setup module. */
export type Ctx = {
  workdir: string;
  gitMode: GitMode;
  gitWritePolicy: GitWritePolicy;
  toolchain: Toolchain[];
  secrets: SecretManager[];
  githubToken: string;
};
