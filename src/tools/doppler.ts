import * as p from "@clack/prompts";
import { run, sh } from "../exec.ts";
import type { Tool } from "./index.ts";

const tool: Tool = {
  id: "doppler",
  label: "Doppler (one project, read-only)",
  default: true,
  required: false,
  async run(ctx) {
    await sh(
      "curl -sLf --retry 3 --tlsv1.2 --proto '=https' 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | sudo gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg",
      { quiet: true },
    );
    await sh(
      `echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/doppler-cli.list >/dev/null`,
      { quiet: true },
    );
    await sh("sudo apt-get update -qq && sudo apt-get install -y -qq doppler", { quiet: true });

    p.log.message(
      [
        "Doppler service token:",
        "  https://dashboard.doppler.com/",
        "  - Pick the project + dev config for this repo.",
        "  - Access tab → Generate Service Token, role Read only.",
        `  - Name it devbox-${ctx.repo.slug}, then copy the token (starts with dp.st.).`,
      ].join("\n"),
    );
    const v = await p.password({
      message: "Paste Doppler token (hidden):",
      validate: (s) => (s && s.startsWith("dp.st.") ? undefined : "Expected a dp.st.* token."),
    });
    if (p.isCancel(v)) throw new Error("Cancelled.");
    const token = (v as string).trim();

    const r = await run("doppler", ["me", "--json"], {
      quiet: true,
      allowFail: true,
      env: { DOPPLER_TOKEN: token },
    });
    if (r.code !== 0) throw new Error("Doppler token didn't validate (doppler me).");

    ctx.tokens.DOPPLER_TOKEN = token;
  },
};

export default tool;
