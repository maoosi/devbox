import { describe, test, expect } from "bun:test";
import { buildAgentsMd } from "../../src/tools/conventions.ts";
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

describe("buildAgentsMd", () => {
  test("header includes the repo identifier", () => {
    const md = buildAgentsMd(ctx({}));
    expect(md).toContain("# Devbox conventions for octocat/hello");
    expect(md).toContain("dedicated to **octocat/hello**");
  });

  test("denied-actions section is always present", () => {
    const md = buildAgentsMd(ctx({}));
    expect(md).toContain("## Denied actions");
    expect(md).toContain("git push --force");
    expect(md).toContain("git push --no-verify");
  });

  test("default rules section is always present and lists all 12 rules", () => {
    const md = buildAgentsMd(ctx({}));
    expect(md).toContain("## Default rules");
    for (let n = 1; n <= 12; n++) {
      expect(md).toContain(`### Rule ${n} —`);
    }
  });

  test("default rules appear before any tool-gated section", () => {
    const md = buildAgentsMd(ctx({
      selectedToolIds: new Set(["mcp", "agent-browser", "socket"]),
      secretsManager: "doppler",
    }));
    const rulesIdx = md.indexOf("## Default rules");
    const githubIdx = md.indexOf("## GitHub");
    const browserIdx = md.indexOf("## Browser");
    const packageIdx = md.indexOf("## Package installs");
    const secretsIdx = md.indexOf("## Secrets");
    const deniedIdx = md.indexOf("## Denied actions");
    expect(rulesIdx).toBeGreaterThan(-1);
    expect(rulesIdx).toBeLessThan(githubIdx);
    expect(rulesIdx).toBeLessThan(browserIdx);
    expect(rulesIdx).toBeLessThan(packageIdx);
    expect(rulesIdx).toBeLessThan(secretsIdx);
    expect(rulesIdx).toBeLessThan(deniedIdx);
  });

  test("denied-actions documents merge-into-main block when write+pushMain=false", () => {
    const md = buildAgentsMd(ctx({
      gitMode: "write",
      gitWritePolicy: { pushMain: false, deleteBranches: false },
    }));
    expect(md).toContain("merges into the default branch");
    expect(md).toContain("gh pr merge");
  });

  test("denied-actions omits merge-into-main note when pushMain=true", () => {
    const md = buildAgentsMd(ctx({
      gitMode: "write",
      gitWritePolicy: { pushMain: true, deleteBranches: false },
    }));
    expect(md).not.toContain("merges into the default branch");
  });

  test("denied-actions omits merge-into-main note in read-only mode", () => {
    const md = buildAgentsMd(ctx({
      gitMode: "read-only",
      gitWritePolicy: { pushMain: false, deleteBranches: false },
    }));
    expect(md).not.toContain("merges into the default branch");
  });

  test("github section appears iff mcp or github tool is installed", () => {
    expect(buildAgentsMd(ctx({}))).not.toContain("## GitHub");
    expect(buildAgentsMd(ctx({ selectedToolIds: new Set(["mcp"]) }))).toContain("## GitHub");
    expect(buildAgentsMd(ctx({ selectedToolIds: new Set(["github"]) }))).toContain("## GitHub");
  });

  test("agent-browser section appears iff agent-browser is installed", () => {
    expect(buildAgentsMd(ctx({}))).not.toContain("## Browser");
    const md = buildAgentsMd(ctx({ selectedToolIds: new Set(["agent-browser"]) }));
    expect(md).toContain("## Browser");
    expect(md).toContain("agent-browser open http://localhost:3000");
    expect(md).toContain("agent-browser snapshot");
  });

  test("package-installs section appears iff socket or ignore-scripts is installed", () => {
    expect(buildAgentsMd(ctx({}))).not.toContain("## Package installs");
    expect(buildAgentsMd(ctx({ selectedToolIds: new Set(["socket"]) }))).toContain("## Package installs");
    expect(buildAgentsMd(ctx({ selectedToolIds: new Set(["ignore-scripts"]) }))).toContain("## Package installs");
  });

  test("secrets section names the chosen manager and is omitted when none", () => {
    expect(buildAgentsMd(ctx({}))).not.toContain("## Secrets");
    expect(buildAgentsMd(ctx({ secretsManager: "doppler" }))).toContain("Doppler is scoped");
    expect(buildAgentsMd(ctx({ secretsManager: "infisical" }))).toContain("Infisical is scoped");
  });

  test("does not leak unselected tool names into the document", () => {
    const md = buildAgentsMd(ctx({})); // nothing installed
    expect(md).not.toContain("agent-browser");
    expect(md).not.toContain("sfw");
    expect(md).not.toContain("Doppler");
    expect(md).not.toContain("Infisical");
  });

  // The drift-warning UX in conventions.ts depends on these byte-equal
  // differences appearing when the user changes tool selection or secrets
  // manager on a re-run. If buildAgentsMd produced identical output across
  // different ctx, the drift warning would never fire.
  test("drift-detection: output differs when tool selection changes", () => {
    const a = buildAgentsMd(ctx({}));
    const b = buildAgentsMd(ctx({ selectedToolIds: new Set(["agent-browser"]) }));
    expect(a).not.toBe(b);
  });

  test("drift-detection: output differs when secrets manager changes", () => {
    const a = buildAgentsMd(ctx({ secretsManager: "doppler" }));
    const b = buildAgentsMd(ctx({ secretsManager: "infisical" }));
    expect(a).not.toBe(b);
  });

  test("drift-detection: output differs when git policy changes", () => {
    const a = buildAgentsMd(ctx({ gitMode: "write", gitWritePolicy: { pushMain: false, deleteBranches: false } }));
    const b = buildAgentsMd(ctx({ gitMode: "write", gitWritePolicy: { pushMain: true, deleteBranches: false } }));
    expect(a).not.toBe(b);
  });
});
