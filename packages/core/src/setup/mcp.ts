import type { Executor } from '../executor';
import type { Ctx, SetupStatus } from '../types';
import { run, runScript } from '../lib';

/**
 * Register the GitHub MCP server with an already-installed Claude Code,
 * authenticated with GH_TOKEN. Idempotent: skipped if already registered.
 * (When this devbox installs Claude Code itself, embed the server in
 * settings.json via setupGuardrails instead — `claude mcp add` ordering is
 * fragile mid-install.)
 */
export async function setupMcp(exec: Executor, ctx: Ctx): Promise<SetupStatus> {
  if (!ctx.githubToken) {
    return { kind: 'reused', note: 'no GitHub token; skipped' };
  }
  const already = await run(
    exec,
    `command -v claude >/dev/null 2>&1 && claude mcp list 2>/dev/null | grep -q '\\bgithub\\b'`,
  );
  if (already.exitCode === 0) {
    return { kind: 'reused', note: 'GitHub MCP already registered' };
  }
  await runScript(
    exec,
    `claude mcp add --scope user --transport http github https://api.githubcopilot.com/mcp/ --header "Authorization: Bearer $GH_TOKEN"`,
  );
  return { kind: 'installed' };
}
