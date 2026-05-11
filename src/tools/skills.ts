import * as fs from "node:fs/promises";
import * as path from "node:path";
import { home } from "../env.ts";
import { isDryRun, note } from "../dryrun.ts";
import type { Tool } from "./index.ts";

// Skills shipped onto every devbox. Add a new entry here AND fetch it in
// install.sh's skills loop (raw.githubusercontent.com has no directory listing).
export const SHIPPED_SKILLS = ["code-review", "code-simplify", "code-manual-tests"] as const;

// Resolve a skill's source SKILL.md whether we're running from a repo clone
// (cwd is the repo root) or under `curl | bash` where install.sh has fetched
// templates/skills/<name>/SKILL.md into a temp dir alongside src/.
function candidatePaths(name: string): string[] {
  return [
    path.resolve("templates", "skills", name, "SKILL.md"),
    path.resolve(import.meta.dir, "..", "..", "templates", "skills", name, "SKILL.md"),
  ];
}

async function readFirst(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      return await fs.readFile(p, "utf8");
    } catch {
      /* try next */
    }
  }
  return null;
}

const tool: Tool = {
  id: "skills",
  label: "Skills",
  hint: "code-review, code-simplify, code-manual-tests",
  default: true,
  required: false,
  async run() {
    const skillsDir = path.join(home(), ".claude", "skills");

    for (const name of SHIPPED_SKILLS) {
      const dest = path.join(skillsDir, name, "SKILL.md");

      if (isDryRun()) {
        note("write", `${dest} (if absent)`);
        continue;
      }

      // Idempotent: don't clobber a user-edited skill.
      try {
        await fs.access(dest);
        continue;
      } catch {
        /* not present — install it */
      }

      const body = await readFirst(candidatePaths(name));
      if (body === null) throw new Error(`skill template not found: ${name}`);

      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, body);
    }
  },
};

export default tool;
