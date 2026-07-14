import type { ExecResult, Executor } from './executor';

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Sourced at the top of every non-interactive script exec so our automation
 * always sees the devbox env file + the fnm/bun/pnpm toolchain on PATH.
 * (Interactive SSH/agent shells get the same via ~/.bashrc.)
 */
export const ENV_PREAMBLE = [
  `[ -f "$HOME/.config/devbox/env" ] && . "$HOME/.config/devbox/env"`,
  `export PATH="$HOME/.local/share/fnm:$HOME/.bun/bin:$HOME/.local/share/pnpm:$HOME/.pulumi/bin:$PATH"`,
  `command -v fnm >/dev/null && eval "$(fnm env --shell bash)"`,
].join('\n');

/** Run a raw bash script (no preamble, no `set -e`). Never throws on non-zero exit. */
export async function run(exec: Executor, script: string): Promise<ExecResult> {
  return exec.exec(script);
}

/** Run a bash script with the env preamble + `set -e`; throws on non-zero exit. */
export async function runScript(exec: Executor, script: string): Promise<ExecResult> {
  const full = `set -e\n${ENV_PREAMBLE}\n${script}`;
  const r = await exec.exec(full);
  if (r.exitCode !== 0) {
    throw new Error(`Command failed (exit ${r.exitCode})${r.output ? `:\n${r.output}` : ''}`);
  }
  return r;
}

export async function folderExists(exec: Executor, path: string): Promise<boolean> {
  const r = await run(exec, `test -d ${shellQuote(path)}`);
  return r.exitCode === 0;
}

/** `pathExpr` is a shell path expression, e.g. `$HOME/.claude/settings.json`. */
export async function fileExists(exec: Executor, pathExpr: string): Promise<boolean> {
  const r = await run(exec, `test -f "${pathExpr}"`);
  return r.exitCode === 0;
}

/**
 * Write `content` to an absolute shell path expression (may contain `$HOME`).
 * Base64-encoded to sidestep all quoting issues; parent dirs are created.
 */
export async function writeFile(exec: Executor, pathExpr: string, content: string): Promise<void> {
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  const script = [
    `target="${pathExpr}"`,
    `mkdir -p "$(dirname "$target")"`,
    `printf %s ${shellQuote(b64)} | base64 -d > "$target"`,
  ].join('\n');
  const r = await run(exec, script);
  if (r.exitCode !== 0) throw new Error(`writeFile ${pathExpr} failed: ${r.output}`);
}

/** Idempotently upsert `export KEY=value` into ~/.config/devbox/env. */
export async function upsertEnv(exec: Executor, key: string, value: string): Promise<void> {
  const line = `export ${key}=${shellQuote(value)}`;
  const b64 = Buffer.from(line, 'utf8').toString('base64');
  const script = [
    `f="$HOME/.config/devbox/env"`,
    `mkdir -p "$(dirname "$f")"; touch "$f"`,
    `grep -v ${shellQuote(`^export ${key}=`)} "$f" > "$f.tmp" || true`,
    `mv "$f.tmp" "$f"`,
    `printf %s ${shellQuote(b64)} | base64 -d >> "$f"; printf '\\n' >> "$f"`,
  ].join('\n');
  const r = await run(exec, script);
  if (r.exitCode !== 0) throw new Error(`upsertEnv ${key} failed: ${r.output}`);
}

/** Append `line` to a file only if `marker` is absent (idempotent). */
export async function ensureLine(
  exec: Executor,
  pathExpr: string,
  marker: string,
  line: string,
): Promise<void> {
  const b64 = Buffer.from(line + '\n', 'utf8').toString('base64');
  const script = [
    `f="${pathExpr}"`,
    `mkdir -p "$(dirname "$f")"; touch "$f"`,
    `grep -qF ${shellQuote(marker)} "$f" || printf %s ${shellQuote(b64)} | base64 -d >> "$f"`,
  ].join('\n');
  const r = await run(exec, script);
  if (r.exitCode !== 0) throw new Error(`ensureLine ${pathExpr} failed: ${r.output}`);
}
