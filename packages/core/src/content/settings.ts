import type { GitMode, GitWritePolicy, McpServer } from '../types';

// Always-deny: catch-all destructive shapes that have no creative phrasing.
// `git push --no-verify` is in here because the pre-push hook (see
// content/hooks.ts) is the only thing enforcing main/delete policies, and
// --no-verify is a one-flag bypass. The env-file path is templated from the
// target machine's home dir — Claude's deny patterns need an absolute path,
// not a `~` expansion.
function baseDeny(homeDir: string): string[] {
  return [
    'Bash(git push --force:*)',
    'Bash(git push -f:*)',
    'Bash(git push --no-verify:*)',
    'Bash(git reset --hard:*)',
    'Bash(git clean -fd:*)',
    'Bash(npm publish:*)',
    'Read(.env)',
    'Read(.env.*)',
    `Read(${homeDir}/.config/devbox/env)`,
  ];
}

// Read-only mode: belt-and-suspenders on top of the read-scoped PAT.
const READ_ONLY_DENY = [
  'Bash(git push:*)',
  'Bash(git commit:*)',
  'Bash(gh pr create:*)',
  'Bash(gh pr edit:*)',
  'Bash(gh pr merge:*)',
  'Bash(gh issue create:*)',
];

// Write mode + pushMain=false: agent layer for the merge-into-main block.
// `gh pr merge` runs server-side and bypasses the local pre-merge-commit hook,
// so it has to be denied here. Local `git merge` is intentionally NOT blocked
// — the agent legitimately runs `git merge main` on a feature branch; the
// pre-merge-commit hook catches the on-main case.
const WRITE_NO_MAIN_DENY = ['Bash(gh pr merge:*)'];

export type SettingsOptions = {
  gitMode: GitMode;
  policy: GitWritePolicy;
  /** Absolute home directory on the target machine (deny patterns don't expand `~`). */
  homeDir: string;
  mcpServers?: Record<string, McpServer>;
  defaultMode?: 'auto' | 'acceptEdits';
  /** Package-specific top-level settings (e.g. sandbox/theme for the ubuntu installer). */
  extra?: Record<string, unknown>;
};

/** Build the ~/.claude/settings.json object encoding this devbox's guardrails. */
export function buildSettings(opts: SettingsOptions): Record<string, unknown> {
  const { gitMode, policy, homeDir, mcpServers = {}, defaultMode = 'acceptEdits', extra = {} } = opts;
  const deny = [
    ...baseDeny(homeDir),
    ...(gitMode === 'read-only' ? READ_ONLY_DENY : []),
    ...(gitMode === 'write' && !policy.pushMain ? WRITE_NO_MAIN_DENY : []),
  ];
  return {
    ...extra,
    permissions: {
      defaultMode,
      deny,
    },
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
  };
}
