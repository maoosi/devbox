import * as p from "@clack/prompts";
import { sh } from "../exec.ts";
import { readEnv } from "../env.ts";
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

    // Smoke-test mode: skip prompt. See comment in doppler.ts.
    if (process.env.DEVBOX_SKIP_TOKENS === "1") {
      const reused = (await readEnv()).INFISICAL_TOKEN;
      if (reused) {
        p.log.info("Reusing existing Infisical token from ~/.config/devbox/env.");
        ctx.tokens.INFISICAL_TOKEN = reused;
      } else {
        p.log.info("Skipping Infisical token (DEVBOX_SKIP_TOKENS).");
        ctx.tokens.INFISICAL_TOKEN = "st.smoke-placeholder";
      }
      return;
    }

    // Re-run path: reuse a previously-stored INFISICAL_TOKEN if it parses as
    // a service token. We don't validate it against the API here — the
    // Infisical CLI has no zero-arg "me" probe, and we don't yet know which
    // project ID to test against. If the token has been revoked, the user
    // can delete the line from ~/.config/devbox/env and re-run.
    const stored = (await readEnv()).INFISICAL_TOKEN;
    if (stored && stored.startsWith("st.")) {
      p.log.info("Reusing existing Infisical token from ~/.config/devbox/env.");
      ctx.tokens.INFISICAL_TOKEN = stored;
      return;
    }

    p.log.message(
      [
        "Infisical service token — open your dashboard:",
        "  https://app.infisical.com/",
      ].join("\n"),
    );
    p.log.warn(
      [
        `Infisical URLs use opaque IDs, so nothing can be pre-filled. In the dashboard:`,
        `  1. Open the project for ${ctx.repo.owner}/${ctx.repo.name}`,
        `  2. Access Control (left panel) → Service Tokens → Create Token`,
        `  3. Service Token Name: devbox-${ctx.repo.slug}`,
        `     Environment: pick the one this devbox should use (e.g. "Agent")`,
        `     Set an expiration`,
        `     Permission: Read`,
        `  4. Click Create and copy the token (starts with st.).`,
        "",
        `Paste the token below.`,
      ].join("\n"),
    );
    const v = await p.password({
      message: "Paste Infisical token (hidden):",
      validate: (s) => (s && s.startsWith("st.") ? undefined : "Expected an st.* service token."),
    });
    if (p.isCancel(v)) throw new Error("Cancelled.");
    ctx.tokens.INFISICAL_TOKEN = (v as string).trim();
  },
};

export default tool;
