import { describe, test, expect } from "bun:test";
import { buildSettings } from "../../src/tools/claude.ts";
import type { GitWritePolicy } from "../../src/tools/index.ts";

type SettingsShape = {
  includeCoAuthoredBy: boolean;
  permissions: { defaultMode: string; deny: string[] };
  sandbox: { enabled: boolean; network: { allowLocalBinding: boolean } };
  theme: string;
  mcpServers?: Record<string, unknown>;
};

const TEST_HOME = "/home/testuser";
const PERMISSIVE: GitWritePolicy = { pushMain: true, deleteBranches: true };
const STRICT: GitWritePolicy = { pushMain: false, deleteBranches: false };

const BASE_DENY_REQUIRED = [
  "Bash(git push --force:*)",
  "Bash(git push -f:*)",
  "Bash(git push --no-verify:*)",
  "Bash(git reset --hard:*)",
  "Bash(git clean -fd:*)",
  "Bash(npm publish:*)",
  "Read(.env)",
  "Read(.env.*)",
  `Read(${TEST_HOME}/.config/devbox/env)`,
];

const READ_ONLY_EXTRA = [
  "Bash(git push:*)",
  "Bash(git commit:*)",
  "Bash(gh pr create:*)",
  "Bash(gh pr edit:*)",
  "Bash(gh pr merge:*)",
  "Bash(gh issue create:*)",
];

const WRITE_NO_MAIN_EXTRA = [
  "Bash(gh pr merge:*)",
];

describe("buildSettings", () => {
  test("write mode + permissive policy: base deny only, no mcpServers key when empty", () => {
    const s = buildSettings({}, "write", PERMISSIVE, TEST_HOME) as SettingsShape;
    expect(s.permissions.deny).toEqual(BASE_DENY_REQUIRED);
    expect("mcpServers" in s).toBe(false);
  });

  test("read-only mode: appends read-only deny entries (regardless of policy)", () => {
    const s = buildSettings({}, "read-only", STRICT, TEST_HOME) as SettingsShape;
    expect(s.permissions.deny).toEqual([...BASE_DENY_REQUIRED, ...READ_ONLY_EXTRA]);
  });

  test("write mode + pushMain=false: appends merge-into-main deny entries", () => {
    const s = buildSettings({}, "write", STRICT, TEST_HOME) as SettingsShape;
    expect(s.permissions.deny).toEqual([...BASE_DENY_REQUIRED, ...WRITE_NO_MAIN_EXTRA]);
    expect(s.permissions.deny).toContain("Bash(gh pr merge:*)");
  });

  test("write mode + pushMain=true: does NOT append merge-into-main deny", () => {
    const s = buildSettings({}, "write", PERMISSIVE, TEST_HOME) as SettingsShape;
    expect(s.permissions.deny).not.toContain("Bash(gh pr merge:*)");
  });

  test("write mode + pushMain=false: does NOT block local git merge (feature-branch updates stay allowed)", () => {
    const s = buildSettings({}, "write", STRICT, TEST_HOME) as SettingsShape;
    expect(s.permissions.deny).not.toContain("Bash(git merge:*)");
  });

  test("mcpServers round-trips when populated", () => {
    const servers = {
      github: {
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer ${GH_TOKEN}" },
      },
    };
    const s = buildSettings(servers, "write", STRICT, TEST_HOME) as SettingsShape;
    expect(s.mcpServers).toEqual(servers);
  });

  test("schema fixed values", () => {
    const s = buildSettings({}, "write", STRICT, TEST_HOME) as SettingsShape;
    expect(s.includeCoAuthoredBy).toBe(false);
    expect(s.permissions.defaultMode).toBe("auto");
    expect(s.sandbox.enabled).toBe(true);
    expect(s.sandbox.network.allowLocalBinding).toBe(true);
    expect(s.theme).toBe("light");
  });

  test("output is JSON-serializable", () => {
    const s = buildSettings({}, "read-only", STRICT, TEST_HOME);
    expect(() => JSON.stringify(s)).not.toThrow();
    const round = JSON.parse(JSON.stringify(s));
    expect(round).toEqual(s);
  });

  test("regression: dotenv reads always denied (both modes)", () => {
    for (const mode of ["read-only", "write"] as const) {
      const s = buildSettings({}, mode, STRICT, TEST_HOME) as SettingsShape;
      expect(s.permissions.deny).toContain("Read(.env)");
      expect(s.permissions.deny).toContain("Read(.env.*)");
    }
  });

  test("regression: --no-verify push always denied (would bypass pre-push hook)", () => {
    for (const mode of ["read-only", "write"] as const) {
      const s = buildSettings({}, mode, STRICT, TEST_HOME) as SettingsShape;
      expect(s.permissions.deny).toContain("Bash(git push --no-verify:*)");
    }
  });

  test("env-file deny uses the supplied home dir (not hardcoded /home/devbox)", () => {
    const s = buildSettings({}, "write", STRICT, "/home/ubuntu") as SettingsShape;
    expect(s.permissions.deny).toContain("Read(/home/ubuntu/.config/devbox/env)");
    expect(s.permissions.deny).not.toContain("Read(/home/devbox/.config/devbox/env)");
  });

  test("regression: no over-broad Read(**) deny that would lock everything down", () => {
    // This is the bug we fixed in the in-repo .claude/settings.json that originally
    // motivated this whole test suite. Deny rules must be specific paths/patterns,
    // never a global match — otherwise the tool can't read its own working directory.
    const s = buildSettings({}, "write", STRICT, TEST_HOME) as SettingsShape;
    for (const rule of s.permissions.deny) {
      expect(rule).not.toMatch(/^(Read|Glob|Grep)\(\*\*\)$/);
    }
  });
});
