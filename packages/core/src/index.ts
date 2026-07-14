export type { ExecResult, Executor } from './executor';
export type {
  Ctx,
  GitMode,
  GitWritePolicy,
  McpServer,
  SecretManager,
  SetupStatus,
  Toolchain,
} from './types';

export {
  ENV_PREAMBLE,
  ensureLine,
  fileExists,
  folderExists,
  run,
  runScript,
  shellQuote,
  upsertEnv,
  writeFile,
} from './lib';

export { preMergeCommitHook, prePushHook, shouldInstallHook } from './content/hooks';
export { buildSettings, type SettingsOptions } from './content/settings';
export { buildAgentsMd, type AgentsMdOptions } from './content/agents-md';

export { setupToolchain, type ToolchainOptions } from './setup/toolchain';
export { setupPulumi } from './setup/pulumi';
export { setupSupplyChain } from './setup/supply-chain';
export { setupSocket } from './setup/socket';
export { setupGitSafety } from './setup/git-safety';
export { setupGuardrails, type GuardrailsOptions } from './setup/guardrails';
export { setupConventions, type ConventionsOptions } from './setup/conventions';
export { setupMcp } from './setup/mcp';
export { setupDoppler } from './setup/doppler';
export { setupInfisical } from './setup/infisical';
export { setupSkills, SHIPPED_SKILLS } from './setup/skills';
export { setupVitePlus } from './setup/vite-plus';
export { setupAgentBrowser, type AgentBrowserOptions } from './setup/agent-browser';
