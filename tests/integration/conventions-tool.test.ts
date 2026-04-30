import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import conventions from "../../src/tools/conventions.ts";
import { setDryRun } from "../../src/dryrun.ts";
import {
  makeSandbox,
  cleanupSandbox,
  applyEnv,
  fileExists,
  makeCtx,
  type Sandbox,
} from "./_helpers.ts";

let sb: Sandbox;
let restore: () => void;

afterEach(async () => {
  setDryRun(false);
  if (restore) restore();
  if (sb) await cleanupSandbox(sb);
});

describe("conventions tool", () => {
  test("writes ~/AGENTS.md gated on installed tools", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await conventions.run(makeCtx({
      selectedToolIds: new Set(["mcp", "agent-browser", "socket", "claude"]),
      secretsManager: "doppler",
    }));

    const body = await fs.readFile(path.join(sb.home, "AGENTS.md"), "utf8");
    expect(body).toContain("## GitHub");
    expect(body).toContain("## Browser");
    expect(body).toContain("## Package installs");
    expect(body).toContain("## Secrets");
    expect(body).toContain("Doppler");
    expect(body).toContain("## Denied actions");
  });

  test("when claude is selected, ~/.claude/CLAUDE.md imports ~/AGENTS.md", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await conventions.run(makeCtx({ selectedToolIds: new Set(["claude"]) }));

    const claudeMd = await fs.readFile(path.join(sb.home, ".claude", "CLAUDE.md"), "utf8");
    expect(claudeMd.trim()).toBe("@~/AGENTS.md");
  });

  test("when claude is NOT selected, ~/.claude/CLAUDE.md is not written", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await conventions.run(makeCtx({ selectedToolIds: new Set([]) }));

    expect(await fileExists(path.join(sb.home, "AGENTS.md"))).toBe(true);
    expect(await fileExists(path.join(sb.home, ".claude", "CLAUDE.md"))).toBe(false);
  });

  test("dry-run: no files written", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    setDryRun(true);
    await conventions.run(makeCtx({ selectedToolIds: new Set(["claude"]) }));

    expect(await fileExists(path.join(sb.home, "AGENTS.md"))).toBe(false);
    expect(await fileExists(path.join(sb.home, ".claude", "CLAUDE.md"))).toBe(false);
  });
});
