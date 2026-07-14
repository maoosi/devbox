import { setupGuardrails } from "@devbox/core";
import { sh } from "../exec.ts";
import { LocalExecutor } from "../executor.ts";
import { toCoreCtx } from "../core-ctx.ts";
import type { Tool, ToolStatus } from "./index.ts";

// Optional: pick the agent CLI you want. Default on so the common case is
// one prompt away. Runs after the other tools so ctx.mcpServers is final
// when settings.json is written. Settings content comes from @devbox/core's
// buildSettings; the extras below are the ubuntu-flavored top-level keys.
// Written on first install only — re-runs preserve user edits.
const tool: Tool = {
  id: "claude",
  label: "Claude Code",
  default: true,
  required: false,
  async run(ctx): Promise<ToolStatus> {
    await sh(
      "bun install -g @anthropic-ai/claude-code || npm install -g @anthropic-ai/claude-code",
      { quiet: true },
    );
    const r = await setupGuardrails(new LocalExecutor(), toCoreCtx(ctx), {
      mcpServers: ctx.mcpServers,
      defaultMode: "auto",
      extra: {
        includeCoAuthoredBy: false,
        sandbox: { enabled: true, network: { allowLocalBinding: true } },
        theme: "light",
      },
    });
    return r.kind === "installed"
      ? { kind: "installed" }
      : { kind: "reused", note: "settings.json already present" };
  },
};

export default tool;
