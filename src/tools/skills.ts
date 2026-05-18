import * as fs from "node:fs/promises";
import * as path from "node:path";
import { home } from "../env.ts";
import { isDryRun, note } from "../dryrun.ts";
import type { Tool, ToolStatus } from "./index.ts";

// Skills shipped onto every devbox. install.sh fetches everything under
// templates/ via tarball glob, so a new skill folder is picked up
// automatically — only this array needs the entry.
export const SHIPPED_SKILLS = ["code-review", "code-simplify", "code-checklist", "code-changelog"] as const;

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
  hint: "code-review, code-simplify, code-checklist, code-changelog",
  default: true,
  required: false,
  async run(): Promise<ToolStatus> {
    const skillsDir = path.join(home(), ".claude", "skills");

    // Track per-skill so the spinner note can show exactly which skills were
    // freshly written (e.g. when we ship new skills) vs. already on disk.
    const fresh: string[] = [];
    const reused: string[] = [];

    for (const name of SHIPPED_SKILLS) {
      const dest = path.join(skillsDir, name, "SKILL.md");

      if (isDryRun()) {
        note("write", `${dest} (if absent)`);
        // Dry-run cannot tell what's on disk in a meaningful way for the
        // summary; treat each as fresh-install for the status report so the
        // dry-run output reflects the worst-case "everything new" path.
        fresh.push(name);
        continue;
      }

      // Idempotent: don't clobber a user-edited skill.
      try {
        await fs.access(dest);
        reused.push(name);
        continue;
      } catch {
        /* not present — install it */
      }

      const body = await readFirst(candidatePaths(name));
      if (body === null) throw new Error(`skill template not found: ${name}`);

      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, body);
      fresh.push(name);
    }

    if (fresh.length === 0) return { kind: "reused", note: `${reused.length} skill(s) already present` };
    if (reused.length === 0) return { kind: "installed", note: fresh.join(", ") };
    return { kind: "mixed", note: `installed ${fresh.join(", ")}; reused ${reused.join(", ")}` };
  },
};

export default tool;
