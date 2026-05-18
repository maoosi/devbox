import * as p from "@clack/prompts";
import { run, sh } from "../exec.ts";
import { readEnv } from "../env.ts";
import type { Tool, ToolStatus } from "./index.ts";

const REUSE_NOTE = "no prompt, stored token still valid. To rotate see ~/DEVBOX.md.";

const tool: Tool = {
  id: "doppler",
  label: "Doppler (one project, read-only)",
  default: true,
  required: false,
  async run(ctx): Promise<ToolStatus> {
    // Install.sh sets `umask 077`, which sudo inherits. Without explicit chmod,
    // the keyring lands as root:root mode 0600 → apt's `_apt` user can't read
    // it → GPG verification fails → `apt-get update` exits 100.
    await sh(
      "curl -sLf --retry 3 --tlsv1.2 --proto '=https' 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/doppler-archive-keyring.gpg && sudo chmod go+r /usr/share/keyrings/doppler-archive-keyring.gpg",
      { quiet: true },
    );
    await sh(
      `echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/doppler-cli.list >/dev/null`,
      { quiet: true },
    );
    await sh("sudo apt-get update -qq && sudo apt-get install -y -qq doppler", { quiet: true });

    // Smoke-test mode: skip prompt + validation. Reuse stored token if present
    // (so the "Reusing" log line still fires on a rerun) else stash a
    // placeholder so writeEnv produces a syntactically valid env file. No real
    // tokens are ever needed in smoke tests.
    if (process.env.DEVBOX_SKIP_TOKENS === "1") {
      const reused = (await readEnv()).DOPPLER_TOKEN;
      if (reused) {
        ctx.tokens.DOPPLER_TOKEN = reused;
        return { kind: "reused", note: REUSE_NOTE };
      }
      ctx.tokens.DOPPLER_TOKEN = "smoke-placeholder";
      return { kind: "installed", note: "smoke-test placeholder token" };
    }

    // Re-run path: reuse a previously-stored DOPPLER_TOKEN if it still works.
    const stored = (await readEnv()).DOPPLER_TOKEN;
    if (stored) {
      const r = await run("doppler", ["me", "--json"], {
        quiet: true,
        allowFail: true,
        env: { DOPPLER_TOKEN: stored },
      });
      if (r.code === 0) {
        ctx.tokens.DOPPLER_TOKEN = stored;
        return { kind: "reused", note: REUSE_NOTE };
      }
    }

    p.log.message(
      ["Doppler service token — open your dashboard:", "  https://dashboard.doppler.com/"].join(
        "\n",
      ),
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
    return { kind: "installed", note: "new token minted and stored" };
  },
};

export default tool;
