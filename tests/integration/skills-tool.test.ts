import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import skills from "../../src/tools/skills.ts";
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
let cwdRestore: () => void;

// The tool resolves SKILL.md sources relative to cwd or the source-tree
// templates/ dir. To exercise the cwd path hermetically, switch into a
// scratch dir we control and seed templates/skills/<name>/SKILL.md there.
async function withFakeTemplates(): Promise<{ root: string; restore: () => void }> {
  const root = await fs.mkdtemp(path.join(sb.binDir, "templates-cwd-"));
  const skillsDir = path.join(root, "templates", "skills", "code-review");
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.writeFile(path.join(skillsDir, "SKILL.md"), "# code-review (test fixture)\n");
  const prev = process.cwd();
  process.chdir(root);
  return { root, restore: () => process.chdir(prev) };
}

beforeEach(async () => {
  sb = await makeSandbox();
  restore = applyEnv(sb);
});

afterEach(async () => {
  setDryRun(false);
  if (cwdRestore) cwdRestore();
  if (restore) restore();
  if (sb) await cleanupSandbox(sb);
});

describe("skills tool", () => {
  test("installs SKILL.md to ~/.claude/skills/<name>/SKILL.md", async () => {
    const { restore: r } = await withFakeTemplates();
    cwdRestore = r;

    await skills.run(makeCtx());

    const dest = path.join(sb.home, ".claude", "skills", "code-review", "SKILL.md");
    expect(await fileExists(dest)).toBe(true);
    const body = await fs.readFile(dest, "utf8");
    expect(body).toContain("code-review");
  });

  test("idempotent: a second run does not clobber a user-edited SKILL.md", async () => {
    const { restore: r } = await withFakeTemplates();
    cwdRestore = r;

    await skills.run(makeCtx());

    const dest = path.join(sb.home, ".claude", "skills", "code-review", "SKILL.md");
    const userEdit = "# code-review (locally edited)\nuser content\n";
    await fs.writeFile(dest, userEdit);

    await skills.run(makeCtx());

    expect(await fs.readFile(dest, "utf8")).toBe(userEdit);
  });

  test("dry-run: nothing written", async () => {
    const { restore: r } = await withFakeTemplates();
    cwdRestore = r;
    setDryRun(true);

    await skills.run(makeCtx());

    expect(await fileExists(path.join(sb.home, ".claude", "skills", "code-review"))).toBe(false);
  });

});
