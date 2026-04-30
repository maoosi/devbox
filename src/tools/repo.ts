import * as fs from "node:fs/promises";
import * as path from "node:path";
import { run } from "../exec.ts";
import { isDryRun, note } from "../dryrun.ts";
import type { Tool } from "./index.ts";

const tool: Tool = {
  id: "repo",
  label: "Clone repo + per-project CLAUDE.md",
  default: true,
  required: true,
  async run(ctx) {
    const target = `/home/devbox/repos/${ctx.repo.slug}`;
    if (isDryRun()) {
      note("clone", `${ctx.repo.url} → ${target}`);
      note("write", `${path.join(target, "CLAUDE.md")} (per-project template, if absent)`);
      return;
    }
    await fs.mkdir("/home/devbox/repos", { recursive: true });
    await run("git", ["clone", ctx.repo.url, target], {
      env: { GH_TOKEN: ctx.tokens.GH_TOKEN, GIT_TERMINAL_PROMPT: "0" },
    });

    // Drop a per-project CLAUDE.md only if the repo doesn't ship one.
    const claudeMd = path.join(target, "CLAUDE.md");
    try {
      await fs.access(claudeMd);
      return;
    } catch {
      /* not present */
    }
    const candidates = [
      path.resolve("templates/CLAUDE.md.tmpl"),
      path.resolve(import.meta.dir, "..", "..", "templates", "CLAUDE.md.tmpl"),
    ];
    for (const c of candidates) {
      try {
        const tmpl = await fs.readFile(c, "utf8");
        const filled = tmpl
          .replace(/\{\{REPO\}\}/g, `${ctx.repo.owner}/${ctx.repo.name}`)
          .replace(/\{\{SLUG\}\}/g, ctx.repo.slug);
        await fs.writeFile(claudeMd, filled);
        return;
      } catch {
        /* try next */
      }
    }
  },
};

export default tool;
