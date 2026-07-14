import type { GitMode, GitWritePolicy } from '../types';

// Pre-push hook script. The default-branch name is resolved at run time so
// "main" / "master" / "trunk" are all handled. Sentinel SHA = branch deletion.
export function prePushHook(policy: GitWritePolicy): string {
  return `#!/bin/sh
# Installed by devbox. Reflects this devbox's git policy.
# Bypassing requires \`--no-verify\`, which is denied at the agent layer
# (when an agent CLI like Claude Code is installed).
ALLOW_MAIN=${policy.pushMain ? 1 : 0}
ALLOW_DELETE=${policy.deleteBranches ? 1 : 0}
DEFAULT_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')"
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=main
ZERO=0000000000000000000000000000000000000000
while read local_ref local_sha remote_ref remote_sha; do
  branch=\${remote_ref#refs/heads/}
  if [ "$local_sha" = "$ZERO" ] && [ "$ALLOW_DELETE" = "0" ]; then
    echo "blocked: branch deletion is disabled by devbox policy" >&2
    exit 1
  fi
  if [ "$branch" = "$DEFAULT_BRANCH" ] && [ "$ALLOW_MAIN" = "0" ]; then
    echo "blocked: direct push to $DEFAULT_BRANCH is disabled by devbox policy" >&2
    exit 1
  fi
done
exit 0
`;
}

// Local-merge counterpart to prePushHook. Refuses any merge commit created
// while HEAD is the default branch when pushMain=false. Catches
// `git checkout main && git merge feature` (non-FF). FF merges create no
// commit and don't fire this hook — those are still caught at push time by
// prePushHook (which blocks every push to the default branch).
export function preMergeCommitHook(policy: GitWritePolicy): string {
  return `#!/bin/sh
# Installed by devbox. Reflects this devbox's git policy.
# Bypassing requires \`--no-verify\`, which is denied at the agent layer.
ALLOW_MAIN=${policy.pushMain ? 1 : 0}
DEFAULT_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')"
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=main
CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null)"
if [ "$CURRENT_BRANCH" = "$DEFAULT_BRANCH" ] && [ "$ALLOW_MAIN" = "0" ]; then
  echo "blocked: merging into $DEFAULT_BRANCH is disabled by devbox policy" >&2
  exit 1
fi
exit 0
`;
}

// Hooks are only meaningful in write mode AND only when at least one
// restriction applies. Read-only mode relies on the PAT scope (server-side) —
// installing a hook there would just inconvenience the human if they ever
// pushed manually.
export function shouldInstallHook(gitMode: GitMode, policy: GitWritePolicy): boolean {
  if (gitMode !== 'write') return false;
  return !(policy.pushMain && policy.deleteBranches);
}
