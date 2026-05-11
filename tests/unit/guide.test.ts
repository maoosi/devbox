import { describe, test, expect } from "bun:test";
import { buildGuideMd } from "../../src/tools/guide.ts";
import type { Ctx } from "../../src/tools/index.ts";

function ctx(overrides: Partial<Ctx>): Ctx {
  return {
    repo: { url: "u", owner: "octocat", name: "hello", slug: "hello" },
    secretsManager: "none",
    gitMode: "write",
    gitWritePolicy: { pushMain: false, deleteBranches: false },
    tokens: {},
    exports: [],
    aliases: [],
    mcpServers: {},
    selectedToolIds: new Set<string>(),
    ...overrides,
  };
}

describe("buildGuideMd", () => {
  test("header includes the repo identifier", () => {
    const md = buildGuideMd(ctx({}));
    expect(md).toContain("# Devbox guide for octocat/hello");
  });

  test("rotate-tokens always includes the GitHub block", () => {
    const md = buildGuideMd(ctx({}));
    expect(md).toContain("## Rotate tokens");
    expect(md).toContain("### GitHub token");
    expect(md).toContain("GH_TOKEN");
  });

  test("doppler block appears iff secretsManager is doppler", () => {
    expect(buildGuideMd(ctx({ secretsManager: "none" }))).not.toContain("### Doppler service token");
    expect(buildGuideMd(ctx({ secretsManager: "infisical" }))).not.toContain("### Doppler service token");
    const md = buildGuideMd(ctx({ secretsManager: "doppler" }));
    expect(md).toContain("### Doppler service token");
    expect(md).toContain("DOPPLER_TOKEN");
  });

  test("infisical block appears iff secretsManager is infisical", () => {
    expect(buildGuideMd(ctx({ secretsManager: "none" }))).not.toContain("### Infisical service token");
    expect(buildGuideMd(ctx({ secretsManager: "doppler" }))).not.toContain("### Infisical service token");
    const md = buildGuideMd(ctx({ secretsManager: "infisical" }));
    expect(md).toContain("### Infisical service token");
    expect(md).toContain("INFISICAL_TOKEN");
  });

  test("claude config and skills sections are always present", () => {
    const md = buildGuideMd(ctx({}));
    expect(md).toContain("## Edit Claude config");
    expect(md).toContain("~/.claude/settings.json");
    expect(md).toContain("## Edit Claude skills");
    expect(md).toContain("code-review");
    expect(md).toContain("code-simplify");
    expect(md).toContain("code-manual-tests");
  });

  test("git permissions section reflects current mode and policy", () => {
    const writeMd = buildGuideMd(ctx({
      gitMode: "write",
      gitWritePolicy: { pushMain: true, deleteBranches: false },
    }));
    expect(writeMd).toContain("## Git permissions");
    expect(writeMd).toContain("Current mode: **write**");
    expect(writeMd).toContain("Push to default branch: allowed");
    expect(writeMd).toContain("Branch deletion: blocked");

    const readMd = buildGuideMd(ctx({ gitMode: "read-only" }));
    expect(readMd).toContain("Current mode: **read-only**");
    expect(readMd).toContain("Agent cannot commit, push, or open PRs");
  });

  test("git permissions section folds in deny rules and hooks together", () => {
    const md = buildGuideMd(ctx({}));
    const gitIdx = md.indexOf("## Git permissions");
    const denyHeading = md.indexOf("### Claude deny rules", gitIdx);
    const hooksHeading = md.indexOf("### Local git hooks", gitIdx);
    expect(gitIdx).toBeGreaterThan(-1);
    expect(denyHeading).toBeGreaterThan(gitIdx);
    expect(hooksHeading).toBeGreaterThan(gitIdx);
    expect(md).toContain("git push --force");
    expect(md).toContain("pre-push");
    expect(md).toContain("pre-merge-commit");
  });

  test("Claude config section keeps non-git rules and points at git permissions for the rest", () => {
    const md = buildGuideMd(ctx({}));
    const claudeIdx = md.indexOf("## Edit Claude config");
    const gitIdx = md.indexOf("## Git permissions");
    expect(claudeIdx).toBeGreaterThan(-1);
    expect(gitIdx).toBeGreaterThan(claudeIdx);
    // Non-git rules belong here.
    expect(md.slice(claudeIdx, gitIdx)).toContain("npm publish");
    expect(md.slice(claudeIdx, gitIdx)).toContain(".env");
    // Git rules belong in the git permissions section, not here.
    expect(md.slice(claudeIdx, gitIdx)).not.toContain("git push --force");
    expect(md.slice(claudeIdx, gitIdx)).not.toContain("gh pr merge");
  });

  test("suggested section includes reconnect command and file map", () => {
    const md = buildGuideMd(ctx({}));
    expect(md).toContain("## Other handy things");
    expect(md).toContain("ssh devbox-hello@orb");
    expect(md).toContain("~/AGENTS.md");
    expect(md).toContain("~/.config/devbox/env");
    expect(md).toContain("~/hello/");
  });

  test("suggested section does not mention dry-run", () => {
    const md = buildGuideMd(ctx({}));
    expect(md).not.toContain("--dry-run");
    expect(md).not.toContain("dry-run");
  });

  // The drift-warning UX in guide.ts depends on these byte-equal differences
  // appearing when the user switches git mode or secrets manager. If
  // buildGuideMd produced identical output across different ctx, the drift
  // warning would never fire.
  test("drift-detection: output differs when git mode changes", () => {
    const a = buildGuideMd(ctx({ gitMode: "write" }));
    const b = buildGuideMd(ctx({ gitMode: "read-only" }));
    expect(a).not.toBe(b);
  });

  test("drift-detection: output differs when secrets manager changes", () => {
    const a = buildGuideMd(ctx({ secretsManager: "doppler" }));
    const b = buildGuideMd(ctx({ secretsManager: "infisical" }));
    expect(a).not.toBe(b);
  });

  // Documents the corrected re-run behavior: settings.json is no longer
  // promised as auto-rewritten. If someone reverts the doc fix, this test
  // catches it.
  test("git permissions section no longer promises settings.json gets auto-rewritten", () => {
    const md = buildGuideMd(ctx({}));
    const gitIdx = md.indexOf("## Git permissions");
    const otherIdx = md.indexOf("## Other handy things");
    const section = md.slice(gitIdx, otherIdx);
    expect(section).not.toMatch(/rewrites all three layers/);
    expect(section).toContain("does **not** rewrite `~/.claude/settings.json`");
  });
});
