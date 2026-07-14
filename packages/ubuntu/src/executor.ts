import type { ExecResult, Executor } from "@devbox/core";
import { sh } from "./exec.ts";

// Core Executor over a local bash spawn — the ubuntu installer runs ON the
// target machine, so "remote" execution is just a subprocess.
export class LocalExecutor implements Executor {
  async exec(script: string): Promise<ExecResult> {
    const r = await sh(script, { quiet: true, allowFail: true });
    return { exitCode: r.code, output: r.stdout + r.stderr };
  }
}
