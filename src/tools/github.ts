import * as p from "@clack/prompts";
import { run, sh } from "../exec.ts";
import { ghClassicTokenUrl, ghFineGrainedTokenUrl } from "../env.ts";
import type { Tool, Ctx } from "./index.ts";

async function pasteToken(label: string): Promise<string> {
  const v = await p.password({
    message: `Paste ${label} (hidden):`,
    validate: (s) => (s && s.length >= 8 ? undefined : "Token looks too short."),
  });
  if (p.isCancel(v)) throw new Error("Cancelled.");
  return (v as string).trim();
}

async function tokenWorks(token: string): Promise<boolean> {
  const r = await run("gh", ["auth", "status"], {
    quiet: true,
    allowFail: true,
    env: { GH_TOKEN: token },
  });
  return r.code === 0;
}

async function collectToken(ctx: Ctx): Promise<string> {
  const name = `devbox-${ctx.repo.slug}`;
  const description = `Used by devbox machine for ${ctx.repo.owner}/${ctx.repo.name}`;
  const access: "read" | "write" = ctx.gitMode === "write" ? "write" : "read";
  const fgUrl = ghFineGrainedTokenUrl({ name, description, ownerLogin: ctx.repo.owner, access });

  p.log.message(
    [
      `GitHub fine-grained token (${access}-only contents/PRs) — open this URL:`,
      `  ${fgUrl}`,
      "",
      "Name, description, owner, and permissions are pre-filled.",
    ].join("\n"),
  );
  p.log.warn(
    [
      `Repository access can't be pre-filled — set it manually in the form:`,
      `  1. Under "Repository access", choose "Only select repositories"`,
      `  2. Pick ${ctx.repo.owner}/${ctx.repo.name}`,
      "",
      `Then click Generate at the bottom and paste the token below.`,
    ].join("\n"),
  );
  let token = await pasteToken("GitHub token");
  if (await tokenWorks(token)) return token;

  p.log.warn("That token didn't validate. Many orgs disable fine-grained PATs — falling back to a classic PAT.");
  p.log.message(
    [
      "GitHub classic token (fallback):",
      `  ${ghClassicTokenUrl({ name })}`,
      `  - Scope: repo (and read:org if your org requires it).`,
    ].join("\n"),
  );
  token = await pasteToken("classic GitHub token");
  if (!(await tokenWorks(token))) throw new Error("GitHub token didn't validate.");
  return token;
}

const tool: Tool = {
  id: "github",
  label: "GitHub CLI + scoped token",
  default: true,
  required: true,
  async run(ctx) {
    await sh(
      "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg",
      { quiet: true },
    );
    await sh(
      `echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null`,
      { quiet: true },
    );
    await sh("sudo apt-get update -qq && sudo apt-get install -y -qq gh", { quiet: true });

    const token = await collectToken(ctx);
    ctx.tokens.GH_TOKEN = token;

    // Sanity-check: the token can read the target repo.
    const r = await run("gh", ["api", `repos/${ctx.repo.owner}/${ctx.repo.name}`], {
      quiet: true,
      allowFail: true,
      env: { GH_TOKEN: token },
    });
    if (r.code !== 0) throw new Error(`Token cannot access ${ctx.repo.owner}/${ctx.repo.name}.`);
  },
};

export default tool;
