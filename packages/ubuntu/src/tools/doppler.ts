import * as p from "@clack/prompts";
import { setupDoppler, upsertEnv } from "@devbox/core";
import { run } from "../exec.ts";
import { readEnv } from "../env.ts";
import { LocalExecutor } from "../executor.ts";
import type { Tool, ToolStatus } from "./index.ts";

const REUSE_NOTE = "no prompt, stored token still valid. To rotate see ~/DEVBOX.md.";

const tool: Tool = {
  id: "doppler",
  label: "Doppler (one project, read-only)",
  default: true,
  required: false,
  async run(ctx): Promise<ToolStatus> {
    const exec = new LocalExecutor();
    // Install the CLI first (no token yet) — token validation below needs it.
    await setupDoppler(exec);

    // Smoke-test mode: skip prompt + validation. Reuse stored token if present
    // (so the reuse status still fires on a rerun) else stash a placeholder so
    // the env file stays syntactically valid. No real tokens are ever needed
    // in smoke tests.
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
    await upsertEnv(exec, "DOPPLER_TOKEN", token);
    return { kind: "installed", note: "new token minted and stored" };
  },
};

export default tool;
