import { describe, test, expect } from 'bun:test';
import { buildSettings, type SettingsOptions } from '../src/content/settings';
import type { GitWritePolicy } from '../src/types';

type SettingsShape = {
  includeCoAuthoredBy?: boolean;
  permissions: { defaultMode: string; deny: string[] };
  sandbox?: { enabled: boolean; network: { allowLocalBinding: boolean } };
  theme?: string;
  mcpServers?: Record<string, unknown>;
};

const TEST_HOME = '/home/testuser';
const PERMISSIVE: GitWritePolicy = { pushMain: true, deleteBranches: true };
const STRICT: GitWritePolicy = { pushMain: false, deleteBranches: false };

// The ubuntu installer's extra top-level settings.
const UBUNTU_EXTRA = {
  includeCoAuthoredBy: false,
  sandbox: { enabled: true, network: { allowLocalBinding: true } },
  theme: 'light',
};

function build(overrides: Partial<SettingsOptions> = {}): SettingsShape {
  return buildSettings({
    gitMode: 'write',
    policy: STRICT,
    homeDir: TEST_HOME,
    ...overrides,
  }) as SettingsShape;
}

const BASE_DENY_REQUIRED = [
  'Bash(git push --force:*)',
  'Bash(git push -f:*)',
  'Bash(git push --no-verify:*)',
  'Bash(git reset --hard:*)',
  'Bash(git clean -fd:*)',
  'Bash(npm publish:*)',
  'Read(.env)',
  'Read(.env.*)',
  `Read(${TEST_HOME}/.config/devbox/env)`,
];

const READ_ONLY_EXTRA = [
  'Bash(git push:*)',
  'Bash(git commit:*)',
  'Bash(gh pr create:*)',
  'Bash(gh pr edit:*)',
  'Bash(gh pr merge:*)',
  'Bash(gh issue create:*)',
];

const WRITE_NO_MAIN_EXTRA = ['Bash(gh pr merge:*)'];

describe('buildSettings', () => {
  test('write mode + permissive policy: base deny only, no mcpServers key when empty', () => {
    const s = build({ policy: PERMISSIVE });
    expect(s.permissions.deny).toEqual(BASE_DENY_REQUIRED);
    expect('mcpServers' in s).toBe(false);
  });

  test('read-only mode: appends read-only deny entries (regardless of policy)', () => {
    const s = build({ gitMode: 'read-only' });
    expect(s.permissions.deny).toEqual([...BASE_DENY_REQUIRED, ...READ_ONLY_EXTRA]);
  });

  test('write mode + pushMain=false: appends merge-into-main deny entries', () => {
    const s = build();
    expect(s.permissions.deny).toEqual([...BASE_DENY_REQUIRED, ...WRITE_NO_MAIN_EXTRA]);
    expect(s.permissions.deny).toContain('Bash(gh pr merge:*)');
  });

  test('write mode + pushMain=true: does NOT append merge-into-main deny', () => {
    const s = build({ policy: PERMISSIVE });
    expect(s.permissions.deny).not.toContain('Bash(gh pr merge:*)');
  });

  test('write mode + pushMain=false: does NOT block local git merge (feature-branch updates stay allowed)', () => {
    const s = build();
    expect(s.permissions.deny).not.toContain('Bash(git merge:*)');
  });

  test('mcpServers round-trips when populated', () => {
    const servers = {
      github: {
        url: 'https://api.githubcopilot.com/mcp/',
        headers: { Authorization: 'Bearer ${GH_TOKEN}' },
      },
    };
    const s = build({ mcpServers: servers });
    expect(s.mcpServers).toEqual(servers);
  });

  test('defaults: acceptEdits mode, no extra top-level keys (upstash shape)', () => {
    const s = build();
    expect(s.permissions.defaultMode).toBe('acceptEdits');
    expect('includeCoAuthoredBy' in s).toBe(false);
    expect('sandbox' in s).toBe(false);
    expect('theme' in s).toBe(false);
  });

  test('ubuntu shape: auto mode + extra top-level settings round-trip', () => {
    const s = build({ defaultMode: 'auto', extra: UBUNTU_EXTRA });
    expect(s.includeCoAuthoredBy).toBe(false);
    expect(s.permissions.defaultMode).toBe('auto');
    expect(s.sandbox?.enabled).toBe(true);
    expect(s.sandbox?.network.allowLocalBinding).toBe(true);
    expect(s.theme).toBe('light');
  });

  test('extra cannot clobber permissions', () => {
    const s = build({ extra: { permissions: { defaultMode: 'bypassPermissions', deny: [] } } });
    expect(s.permissions.defaultMode).toBe('acceptEdits');
    expect(s.permissions.deny).toEqual([...BASE_DENY_REQUIRED, ...WRITE_NO_MAIN_EXTRA]);
  });

  test('output is JSON-serializable', () => {
    const s = build({ gitMode: 'read-only' });
    expect(() => JSON.stringify(s)).not.toThrow();
    const round = JSON.parse(JSON.stringify(s));
    expect(round).toEqual(s);
  });

  test('regression: dotenv reads always denied (both modes)', () => {
    for (const gitMode of ['read-only', 'write'] as const) {
      const s = build({ gitMode });
      expect(s.permissions.deny).toContain('Read(.env)');
      expect(s.permissions.deny).toContain('Read(.env.*)');
    }
  });

  test('regression: --no-verify push always denied (would bypass pre-push hook)', () => {
    for (const gitMode of ['read-only', 'write'] as const) {
      const s = build({ gitMode });
      expect(s.permissions.deny).toContain('Bash(git push --no-verify:*)');
    }
  });

  test('env-file deny uses the supplied home dir (not hardcoded /home/devbox)', () => {
    const s = build({ homeDir: '/home/ubuntu' });
    expect(s.permissions.deny).toContain('Read(/home/ubuntu/.config/devbox/env)');
    expect(s.permissions.deny).not.toContain('Read(/home/devbox/.config/devbox/env)');
  });

  test('regression: deny patterns use the correct `:*` separator, never a bare `*`', () => {
    // Upstash's original guardrails shipped `Bash(git push --force*)` (missing
    // the `:` separator) and a non-expanding `~` path — both silently inert.
    for (const gitMode of ['read-only', 'write'] as const) {
      const s = build({ gitMode });
      for (const rule of s.permissions.deny) {
        if (rule.startsWith('Bash(')) expect(rule).not.toMatch(/[^:]\*\)$/);
        expect(rule).not.toContain('~');
      }
    }
  });

  test('regression: no over-broad Read(**) deny that would lock everything down', () => {
    // Deny rules must be specific paths/patterns, never a global match —
    // otherwise the tool can't read its own working directory.
    const s = build();
    for (const rule of s.permissions.deny) {
      expect(rule).not.toMatch(/^(Read|Glob|Grep)\(\*\*\)$/);
    }
  });

  test('serialized output differs between git modes', () => {
    const a = JSON.stringify(build({ gitMode: 'write' }));
    const b = JSON.stringify(build({ gitMode: 'read-only' }));
    expect(a).not.toBe(b);
  });

  test('serialized output differs between write policies', () => {
    const permissive = JSON.stringify(build({ policy: PERMISSIVE }));
    const strict = JSON.stringify(build({ policy: STRICT }));
    expect(permissive).not.toBe(strict);
  });
});
