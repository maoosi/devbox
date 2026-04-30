import * as p from "@clack/prompts";
import { sh } from "../exec.ts";
import type { Tool } from "./index.ts";

const tool: Tool = {
  id: "infisical",
  label: "Infisical (one project, read-only)",
  default: false,
  required: false,
  async run(ctx) {
    await sh(
      "curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash",
      { quiet: true },
    );
    await sh("sudo apt-get update -qq && sudo apt-get install -y -qq infisical", { quiet: true });

    p.log.message(
      [
        "Infisical machine identity token — open your dashboard:",
        "  https://app.infisical.com/",
      ].join("\n"),
    );
    p.log.warn(
      [
        `Infisical URLs use opaque IDs, so nothing can be pre-filled. In the dashboard:`,
        `  1. Open your project for ${ctx.repo.owner}/${ctx.repo.name}`,
        `  2. Settings → Access Control → Machine Identities → Create`,
        `  3. Name: devbox-${ctx.repo.slug}. Read access to the dev environment only.`,
        `  4. Use Universal Auth and copy the token.`,
        "",
        `Paste the token below.`,
      ].join("\n"),
    );
    const v = await p.password({
      message: "Paste Infisical token (hidden):",
      validate: (s) => (s && s.length >= 8 ? undefined : "Token looks too short."),
    });
    if (p.isCancel(v)) throw new Error("Cancelled.");
    ctx.tokens.INFISICAL_TOKEN = (v as string).trim();
  },
};

export default tool;
