import { spawn } from "node:child_process";
import { isDryRun, note } from "./dryrun.ts";

export type RunOptions = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  quiet?: boolean;
  allowFail?: boolean;
  // Bypass dry-run mode. Use only for read-only introspection that
  // informs prompt defaults (e.g. reading existing git config).
  force?: boolean;
};

export type RunResult = { code: number; stdout: string; stderr: string };

export async function run(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  if (isDryRun() && !opts.force) {
    note("exec", `${cmd} ${args.join(" ")}`);
    return { code: 0, stdout: "", stderr: "" };
  }
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...(opts.env ?? {}) } as NodeJS.ProcessEnv,
    cwd: opts.cwd,
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => {
    stdout += d;
    if (!opts.quiet) process.stdout.write(d);
  });
  child.stderr?.on("data", (d) => {
    stderr += d;
    if (!opts.quiet) process.stderr.write(d);
  });
  const code: number = await new Promise((res) => {
    child.on("close", (c) => res(c ?? 0));
    child.on("error", () => res(1));
  });
  if (code !== 0 && !opts.allowFail) {
    // When `quiet: true` swallows stdio, the calling tool's spinner just
    // stops with a generic "✗" — surface the captured stderr (last 800 chars
    // is enough to see the real cause) so failures are diagnosable.
    const tail = (stderr || stdout).trim().slice(-800);
    const detail = tail ? `\n${tail}` : "";
    throw new Error(`${cmd} ${args.join(" ")} failed (${code})${detail}`);
  }
  return { code, stdout, stderr };
}

export function sh(script: string, opts: RunOptions = {}): Promise<RunResult> {
  return run("bash", ["-c", script], opts);
}

export async function has(cmd: string): Promise<boolean> {
  const r = await run("which", [cmd], { quiet: true, allowFail: true });
  return r.code === 0;
}

// For commands that need a real TTY (e.g. claude login's OAuth flow).
// stdio:'inherit' so the user sees prompts and can interact directly.
export async function runInteractive(cmd: string, args: string[]): Promise<number> {
  if (isDryRun()) {
    note("interactive", `${cmd} ${args.join(" ")}`);
    return 0;
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}
