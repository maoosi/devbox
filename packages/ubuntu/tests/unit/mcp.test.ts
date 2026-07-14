import { describe, test, expect } from "bun:test";
import mcp from "../../src/tools/mcp.ts";
import type { Ctx } from "../../src/tools/index.ts";

function makeCtx(): Ctx {
  return {
    repo: { url: "https://github.com/o/r", owner: "o", name: "r", slug: "r" },
    secretsManager: "none",
    gitMode: "write",
    gitWritePolicy: { pushMain: false, deleteBranches: false },
    tokens: {},
    exports: [],
    aliases: [],
    mcpServers: {},
    selectedToolIds: new Set<string>(),
  };
}

describe("mcp tool", () => {
  test("registers the github MCP server with bearer auth on GH_TOKEN", async () => {
    const ctx = makeCtx();
    await mcp.run(ctx);
    expect(ctx.mcpServers.github).toEqual({
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer ${GH_TOKEN}" },
    });
  });

  test("does not touch unrelated ctx state", async () => {
    const ctx = makeCtx();
    await mcp.run(ctx);
    expect(ctx.aliases).toEqual([]);
    expect(ctx.exports).toEqual([]);
    expect(ctx.tokens).toEqual({});
  });
});
