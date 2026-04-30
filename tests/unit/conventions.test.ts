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
});
