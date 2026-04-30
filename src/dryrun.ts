// Dry-run mode: print what the installer would do without changing anything.
// Set via --dry-run / -n on the CLI. Token-paste prompts still happen so the
// UI flow is realistic, but no commands run and no files are written.
import * as p from "@clack/prompts";

let active = false;

export function setDryRun(v: boolean): void {
  active = v;
}

export function isDryRun(): boolean {
  return active;
}

export function note(action: string, detail?: string): void {
  if (!active) return;
  p.log.message(`[dry-run] ${action}${detail ? `: ${detail}` : ""}`);
}
