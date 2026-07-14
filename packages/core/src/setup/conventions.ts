import type { Executor } from '../executor';
import type { SetupStatus } from '../types';
import { fileExists, writeFile } from '../lib';
import { buildAgentsMd, type AgentsMdOptions } from '../content/agents-md';

export type ConventionsOptions = AgentsMdOptions & {
  /** Also drop ~/.claude/CLAUDE.md importing AGENTS.md (when Claude Code is present). */
  claudeShim: boolean;
};

const CLAUDE_IMPORT_BODY = '@~/AGENTS.md\n';

/**
 * Write ~/AGENTS.md (read by Codex/Gemini natively) and, for Claude Code,
 * ~/.claude/CLAUDE.md importing it as the single source of truth. Both are
 * write-only-if-absent so user edits survive re-runs.
 */
export async function setupConventions(
  exec: Executor,
  opts: ConventionsOptions,
): Promise<SetupStatus> {
  let agentsKind: 'installed' | 'reused';
  if (await fileExists(exec, '$HOME/AGENTS.md')) {
    agentsKind = 'reused';
  } else {
    await writeFile(exec, '$HOME/AGENTS.md', buildAgentsMd(opts));
    agentsKind = 'installed';
  }

  let shimKind: 'installed' | 'reused' | 'skipped' = 'skipped';
  if (opts.claudeShim) {
    if (await fileExists(exec, '$HOME/.claude/CLAUDE.md')) {
      shimKind = 'reused';
    } else {
      await writeFile(exec, '$HOME/.claude/CLAUDE.md', CLAUDE_IMPORT_BODY);
      shimKind = 'installed';
    }
  }

  // The shim is small and rarely the headline, so the status reflects
  // AGENTS.md primarily. If the shim landed fresh while AGENTS.md was
  // reused, surface that as mixed so the caller sees the shim was created.
  if (agentsKind === 'installed') return { kind: 'installed' };
  if (shimKind === 'installed') {
    return { kind: 'mixed', note: 'AGENTS.md reused; CLAUDE.md shim installed' };
  }
  return { kind: 'reused', note: 'AGENTS.md already present' };
}
