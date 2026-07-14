import type { Executor } from '../executor';
import type { Ctx, McpServer, SetupStatus } from '../types';
import { fileExists, run, writeFile } from '../lib';
import { buildSettings } from '../content/settings';

export type GuardrailsOptions = {
  mcpServers?: Record<string, McpServer>;
  defaultMode?: 'auto' | 'acceptEdits';
  extra?: Record<string, unknown>;
};

/**
 * Write Claude Code agent guardrails to ~/.claude/settings.json. Only written
 * when absent, so user edits on an existing machine are preserved.
 */
export async function setupGuardrails(
  exec: Executor,
  ctx: Ctx,
  opts: GuardrailsOptions = {},
): Promise<SetupStatus> {
  if (await fileExists(exec, '$HOME/.claude/settings.json')) {
    return { kind: 'reused', note: 'settings.json already present' };
  }
  // Deny patterns need an absolute path (no `~` expansion) — resolve the
  // target machine's home dir once.
  const homeDir = (await run(exec, `printf %s "$HOME"`)).output.trim();
  if (!homeDir.startsWith('/')) {
    throw new Error(`Could not resolve $HOME on target (got ${JSON.stringify(homeDir)})`);
  }
  const settings = buildSettings({
    gitMode: ctx.gitMode,
    policy: ctx.gitWritePolicy,
    homeDir,
    ...opts,
  });
  await writeFile(exec, '$HOME/.claude/settings.json', JSON.stringify(settings, null, 2) + '\n');
  return { kind: 'installed' };
}
