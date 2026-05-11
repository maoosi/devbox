import * as fs from "node:fs/promises";
import * as p from "@clack/prompts";

// Files like ~/AGENTS.md, ~/DEVBOX.md, ~/.claude/settings.json are written
// once on first install and never overwritten — re-runs leave user edits
// intact. Trade-off: a re-run that should refresh the file (e.g. switching
// git mode rewrites the deny list, or changing tool selection rewrites
// AGENTS.md sections) silently does nothing, and the user can't tell.
//
// detectDrift compares what the install would write today against what's on
// disk. When they differ, return { stale: true } — the caller emits a loud
// warning that points at ~/DEVBOX.md for the manual refresh path. Falsy on
// fresh installs (no file yet) and on byte-equal matches (re-run is a true
// no-op).
export async function detectDrift(filePath: string, wouldWrite: string): Promise<{ stale: boolean }> {
  let onDisk: string;
  try {
    onDisk = await fs.readFile(filePath, "utf8");
  } catch {
    return { stale: false }; // file doesn't exist — caller will write it fresh
  }
  return { stale: onDisk !== wouldWrite };
}

// Standard warning shape. All three drift sites share the same message
// structure so the user learns the recovery path once and applies it
// everywhere. The DEVBOX.md pointer is the single source of truth for
// hand-edit instructions; we do NOT duplicate them in the warning.
export function warnDrift(filePath: string, devboxSection?: string): void {
  const hint = devboxSection
    ? `To edit by hand: see ~/DEVBOX.md → ${devboxSection}.`
    : `To edit by hand: see ~/DEVBOX.md.`;
  p.log.warn(
    `${filePath} on disk does not match current install settings.\n` +
    `To refresh: delete the file and re-run the installer.\n` +
    hint,
  );
}
