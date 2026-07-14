import { Box } from '@upstash/box';
import type { ResolvedConfig } from './config';
import { NAME_RE, belongsToProject, workspaceBoxName } from './names';

export const SSH_HOST = 'us-east-1.box.upstash.com';

type Snapshot = Awaited<ReturnType<Box['listSnapshots']>>[number];
export type BoxData = Awaited<ReturnType<typeof Box.list>>[number];

/** `Box.getByName` throws when missing — this returns undefined instead. */
export async function findBoxByName(name: string): Promise<Box | undefined> {
  try {
    return await Box.getByName(name);
  } catch {
    return undefined;
  }
}

const READY = new Set(['running', 'idle']);

/**
 * Resume a paused box and/or wait until it accepts work. Boxes are created with
 * keepAlive:false, so anything idle for a while comes back as 'paused'.
 */
export async function ensureRunning(
  box: Box,
  opts: { log?: (msg: string) => void; timeoutMs?: number } = {},
) {
  const log = opts.log ?? console.log;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  let { status } = await box.getStatus();
  if (READY.has(status)) return;
  if (status === 'error' || status === 'deleted') {
    throw new Error(`Box ${box.id} is in status '${status}'`);
  }
  if (status === 'paused') {
    log('Resuming paused box...');
    await box.resume();
  } else {
    log(`Waiting for box (${status})...`);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    ({ status } = await box.getStatus());
    if (READY.has(status)) return;
    if (status === 'error' || status === 'deleted') {
      throw new Error(`Box ${box.id} entered status '${status}' while waiting`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for box ${box.id} to become ready (last status: ${status})`);
}

/** Resolve a workspace argument to its box, with friendly errors. */
export async function requireWorkspaceBox(cfg: ResolvedConfig, workspace: string): Promise<Box> {
  if (!NAME_RE.test(workspace)) {
    throw new Error(`Invalid workspace name '${workspace}' (allowed: ${NAME_RE})`);
  }
  const box = await findBoxByName(workspaceBoxName(cfg.name, workspace));
  if (!box) {
    throw new Error(`Workspace '${workspace}' not found — create it with: devbox create ${workspace}`);
  }
  return box;
}

/** Find the project's base snapshot via the base box (Upstash is the source of truth). */
export async function findBaseSnapshot(
  cfg: ResolvedConfig,
): Promise<{ baseBox: Box; snapshot: Snapshot | undefined } | undefined> {
  const baseBox = await findBoxByName(cfg.baseBoxName);
  if (!baseBox) return undefined;
  const snapshots = await baseBox.listSnapshots();
  const snapshot = snapshots.find((s) => s.name === cfg.snapshotName && s.status !== 'deleted');
  return { baseBox, snapshot };
}

/** All non-deleted boxes belonging to this project (base + workspaces). */
export async function listProjectBoxes(cfg: ResolvedConfig): Promise<BoxData[]> {
  const all = await Box.list();
  return all.filter((b) => belongsToProject(cfg.name, b.name) && b.status !== 'deleted');
}

/** Current git branch inside the box's workdir; undefined when not determinable. */
export async function getBranch(box: Box, workdir: string): Promise<string | undefined> {
  try {
    const r = await box.exec.command(
      `bash -c 'exec 2>&1; git -C /workspace/${workdir} rev-parse --abbrev-ref HEAD'`,
    );
    if (r.exitCode !== 0) return undefined;
    const branch = (r.result || '').trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}
