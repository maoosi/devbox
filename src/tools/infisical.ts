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
        "Infisical machine identity token:",
        "  https://app.infisical.com/",
        "  - Open your project for this repo.",
        "  - Settings → Access Control → Machine Identities → Create.",
        `  - Name it devbox-${ctx.repo.slug}, grant read access to the dev environment only.`,
        "  - Use Universal Auth, copy the token.",
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
