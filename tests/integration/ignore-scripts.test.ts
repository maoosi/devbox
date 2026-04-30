import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import ignoreScripts from "../../src/tools/ignore-scripts.ts";
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

describe("ignore-scripts tool", () => {
  test("creates ~/.bunfig.toml with [install] ignoreScripts = true on fresh HOME", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await ignoreScripts.run(makeCtx());

    const body = await fs.readFile(path.join(sb.home, ".bunfig.toml"), "utf8");
    expect(body).toContain("[install]");
    expect(body).toContain("ignoreScripts = true");
  });

  test("idempotent: second run leaves bunfig unchanged", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await ignoreScripts.run(makeCtx());
    const first = await fs.readFile(path.join(sb.home, ".bunfig.toml"), "utf8");
    await ignoreScripts.run(makeCtx());
    const second = await fs.readFile(path.join(sb.home, ".bunfig.toml"), "utf8");
    expect(second).toBe(first);
  });

  test("respects existing bunfig with the setting already present", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    const bunfig = path.join(sb.home, ".bunfig.toml");
    const original = "[install]\nexact = true\nignoreScripts = true\n# preserved\n";
    await fs.writeFile(bunfig, original);

    await ignoreScripts.run(makeCtx());
    expect(await fs.readFile(bunfig, "utf8")).toBe(original);
  });

  test("invokes npm and pnpm config set via stubs", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await ignoreScripts.run(makeCtx());

    const log = await readStubLog(sb);
    expect(log).toContain("npm\tconfig\tset\tignore-scripts\ttrue");
    expect(log).toContain("pnpm\tconfig\tset\tignore-scripts\ttrue");
  });
});
