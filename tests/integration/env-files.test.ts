import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { writeEnv, writeShellInit } from "../../src/env.ts";
import { setDryRun } from "../../src/dryrun.ts";
import {
  makeSandbox,
  cleanupSandbox,
  applyEnv,
  fileExists,
  type Sandbox,
} from "./_helpers.ts";

let sb: Sandbox;
let restore: () => void;

afterEach(async () => {
  setDryRun(false);
  if (restore) restore();
  if (sb) await cleanupSandbox(sb);
});

describe("writeEnv", () => {
  test("writes ~/.config/devbox/env with mode 0600 and quote-escaped values", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await writeEnv({ GH_TOKEN: "abc", QUOTED: 'has "quotes" inside' });

    const envPath = path.join(sb.home, ".config", "devbox", "env");
    expect(await fileExists(envPath)).toBe(true);

    const stat = await fs.stat(envPath);
    expect(stat.mode & 0o777).toBe(0o600);

    const dirStat = await fs.stat(path.dirname(envPath));
    expect(dirStat.mode & 0o777).toBe(0o700);

    const body = await fs.readFile(envPath, "utf8");
    expect(body).toContain('GH_TOKEN="abc"');
    expect(body).toContain('QUOTED="has \\"quotes\\" inside"');
  });

  test("dry-run: no file written", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    setDryRun(true);
    await writeEnv({ FOO: "bar" });
    expect(await fileExists(path.join(sb.home, ".config", "devbox", "env"))).toBe(false);
  });
});

describe("writeShellInit", () => {
  test("writes ~/.bashrc.d/devbox.sh with sourced env-file line + exports/aliases", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    await writeShellInit({ exports: ["export FOO=1"], aliases: [`alias x="y"`] });

    const sh = await fs.readFile(path.join(sb.home, ".bashrc.d", "devbox.sh"), "utf8");
    expect(sh).toContain("# managed by devbox install");
    expect(sh).toMatch(/\[ -f .*\.config\/devbox\/env \] && set -a && \. .*\.config\/devbox\/env && set \+a/);
    expect(sh).toContain("export FOO=1");
    expect(sh).toContain(`alias x="y"`);
  });

  test("appends source-line to ~/.bashrc only once across multiple runs", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    const bashrc = path.join(sb.home, ".bashrc");

    await writeShellInit({});
    await writeShellInit({});
    await writeShellInit({});

    const body = await fs.readFile(bashrc, "utf8");
    const matches = body.match(/for f in ~\/\.bashrc\.d\/\*\.sh/g) ?? [];
    expect(matches.length).toBe(1);
  });

  test("preserves existing ~/.bashrc content when appending", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    const bashrc = path.join(sb.home, ".bashrc");
    await fs.writeFile(bashrc, "# user config\nexport USER_VAR=1\n");

    await writeShellInit({});

    const body = await fs.readFile(bashrc, "utf8");
    expect(body).toContain("# user config");
    expect(body).toContain("export USER_VAR=1");
    expect(body).toContain("for f in ~/.bashrc.d/*.sh");
  });

  test("dry-run: no devbox.sh written, no bashrc append", async () => {
    sb = await makeSandbox();
    restore = applyEnv(sb);
    setDryRun(true);
    await writeShellInit({ exports: ["export FOO=1"] });
    expect(await fileExists(path.join(sb.home, ".bashrc.d", "devbox.sh"))).toBe(false);
    expect(await fileExists(path.join(sb.home, ".bashrc"))).toBe(false);
  });
});
