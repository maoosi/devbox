import type { Box } from '@upstash/box';
import { shellQuote, type ExecResult, type Executor } from '@devbox/core';

/** Core Executor over the Upstash Box exec channel. */
export class BoxExecutor implements Executor {
  constructor(private box: Box) {}

  async exec(script: string): Promise<ExecResult> {
    // Run.result returns only stderr when stderr is non-empty — scripts that
    // need clean stdout capture should `exec 2>&1` themselves.
    const r = await this.box.exec.command(`bash -c ${shellQuote(script)}`);
    return { exitCode: r.exitCode ?? 1, output: r.result ?? '' };
  }
}
