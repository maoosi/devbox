import { spawn } from "node:child_process";

export type RunOptions = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  quiet?: boolean;
  allowFail?: boolean;
};

export type RunResult = { code: number; stdout: string; stderr: string };

export async function run(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
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
    throw new Error(`${cmd} ${args.join(" ")} failed (${code})`);
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
