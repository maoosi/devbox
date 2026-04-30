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
        "Doppler service token — open your dashboard:",
        "  https://dashboard.doppler.com/",
      ].join("\n"),
    );
    p.log.warn(
      [
        `Doppler URLs use opaque IDs, so nothing can be pre-filled. In the dashboard:`,
        `  1. Open the project for ${ctx.repo.owner}/${ctx.repo.name}`,
        `  2. Click the branch config you want this devbox to use (e.g. "agents")`,
        `  3. Inside that branch config, open the Access tab → Generate Service Token`,
        `  4. Role: Read only. Name: devbox-${ctx.repo.slug}`,
        "",
        `Copy the token (starts with dp.st.) and paste below.`,
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
