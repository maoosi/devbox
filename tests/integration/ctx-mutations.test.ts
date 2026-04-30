import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import socket from "../../src/tools/socket.ts";
import mcp from "../../src/tools/mcp.ts";
import runtimes from "../../src/tools/runtimes.ts";
import {
  makeSandbox,
  cleanupSandbox,
  applyEnv,
  readStubLog,
  makeCtx,
  type Sandbox,
} from "./_helpers.ts";

let sb: Sandbox;
let restore: () => void;

afterEach(async () => {
  if (restore) restore();
  if (sb) await cleanupSandbox(sb);
});

describe("socket tool", () => {
  test("pushes the 6 sfw aliases onto ctx.aliases in order", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    const ctx = makeCtx();
    await socket.run(ctx);
    expect(ctx.aliases).toEqual([
      `alias npm="sfw npm"`,
      `alias pnpm="sfw pnpm"`,
      `alias yarn="sfw yarn"`,
      `alias pip="sfw pip"`,
      `alias uv="sfw uv"`,
      `alias cargo="sfw cargo"`,
    ]);
  });

  test("invokes `npm install -g sfw` via stubs", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await socket.run(makeCtx());
    const log = await readStubLog(sb);
    expect(log).toContain("npm\tinstall\t-g\tsfw");
  });
});

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

describe("runtimes tool", () => {
  test("pushes PATH/PNPM_HOME exports onto ctx.exports", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    // The fnm install step is invoked via an absolute path ($HOME/.local/share/fnm/fnm),
    // which bypasses PATH stubs. Drop a no-op binary at that exact path.
    const fnmDir = path.join(sb.home, ".local", "share", "fnm");
    await fs.mkdir(fnmDir, { recursive: true });
    await fs.writeFile(path.join(fnmDir, "fnm"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    const ctx = makeCtx();
    await runtimes.run(ctx);
    expect(ctx.exports).toContain(`export PATH="$HOME/.bun/bin:$PATH"`);
    expect(ctx.exports).toContain(`export PNPM_HOME="$HOME/.local/share/pnpm"`);
    expect(ctx.exports).toContain(`export PATH="$PNPM_HOME:$PATH"`);
    expect(ctx.exports.some((l) => l.includes("fnm env --shell bash"))).toBe(true);
  });
});
