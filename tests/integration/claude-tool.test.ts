import { describe, test, expect, afterEach } from "bun:test";
import * as path from "node:path";
import claudeTool from "../../src/tools/claude.ts";
import { setDryRun } from "../../src/dryrun.ts";
import {
  makeSandbox,
  cleanupSandbox,
  applyEnv,
  fileExists,
  readJson,
  readStubLog,
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

type Settings = {
  permissions: { deny: string[] };
  mcpServers?: Record<string, unknown>;
};

describe("claude tool integration", () => {
  test("write mode: writes settings.json without read-only deny rules", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await claudeTool.run(makeCtx({ gitMode: "write" }));

    const out = path.join(sb.home, ".claude", "settings.json");
    expect(await fileExists(out)).toBe(true);
    const s = await readJson<Settings>(out);
    expect(s.permissions.deny).toContain("Bash(git push --no-verify:*)");
    expect(s.permissions.deny).not.toContain("Bash(git commit:*)");
    expect("mcpServers" in s).toBe(false);
  });

  test("read-only mode: deny rules include git commit / push / gh pr operations", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await claudeTool.run(makeCtx({ gitMode: "read-only" }));

    const s = await readJson<Settings>(path.join(sb.home, ".claude", "settings.json"));
    for (const rule of [
      "Bash(git commit:*)",
      "Bash(git push:*)",
      "Bash(gh pr create:*)",
      "Bash(gh pr edit:*)",
      "Bash(gh pr merge:*)",
      "Bash(gh issue create:*)",
    ]) {
      expect(s.permissions.deny).toContain(rule);
    }
  });

  test("mcpServers round-trip when ctx is populated", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    const servers = {
      github: {
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer ${GH_TOKEN}" },
      },
    };
    await claudeTool.run(makeCtx({ mcpServers: servers }));

    const s = await readJson<Settings>(path.join(sb.home, ".claude", "settings.json"));
    expect(s.mcpServers).toEqual(servers);
  });

  test("invokes the install command via stubbed shell", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await claudeTool.run(makeCtx());
    const log = await readStubLog(sb);
    // The install line is "bun install -g @anthropic-ai/claude-code || npm install -g ...";
    // bash runs the LHS first; with bun stubbed to exit 0, npm is never reached.
    expect(log.some((l) => l.startsWith("bun\tinstall\t-g\t@anthropic-ai/claude-code"))).toBe(true);
  });

  test("dry-run: does not write settings.json", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    setDryRun(true);
    await claudeTool.run(makeCtx());
    expect(await fileExists(path.join(sb.home, ".claude", "settings.json"))).toBe(false);
  });
});
