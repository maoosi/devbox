/** Result of running a script through an Executor. */
export type ExecResult = { exitCode: number; output: string };

/**
 * Minimal shell transport every setup primitive runs through. Implementations
 * are provided by the consuming package: a local bash spawn (ubuntu installer)
 * or a remote box exec (upstash CLI).
 *
 * `output` is best-effort combined stdout/stderr — the Upstash Box transport
 * only surfaces stderr when stderr is non-empty.
 */
export interface Executor {
  /** Run `script` under bash on the target machine. Must not throw on non-zero exit. */
  exec(script: string): Promise<ExecResult>;
}
