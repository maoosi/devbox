import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Executor } from '../executor';
import type { SetupStatus } from '../types';
import { fileExists, writeFile } from '../lib';

// Skills shipped onto every devbox. Templates live in this package
// (packages/core/templates/skills/<name>/SKILL.md), so a new skill folder is
// picked up by both installers automatically — only this array needs the entry.
export const SHIPPED_SKILLS = [
  'code-review',
  'code-simplify',
  'code-checklist',
  'code-changelog',
] as const;

// Template content is read from core's own directory — core code always runs
// on the operator's machine, even when the Executor targets a remote box.
function templatePath(name: string): string {
  return path.resolve(import.meta.dir, '..', '..', 'templates', 'skills', name, 'SKILL.md');
}

/**
 * Install the bundled Claude Code skills into ~/.claude/skills/. Idempotent:
 * an existing SKILL.md is never overwritten, so user edits survive re-runs.
 */
export async function setupSkills(exec: Executor): Promise<SetupStatus> {
  const fresh: string[] = [];
  const reused: string[] = [];

  for (const name of SHIPPED_SKILLS) {
    const dest = `$HOME/.claude/skills/${name}/SKILL.md`;
    if (await fileExists(exec, dest)) {
      reused.push(name);
      continue;
    }
    const body = await fs.readFile(templatePath(name), 'utf8').catch(() => null);
    if (body === null) throw new Error(`skill template not found: ${name}`);
    await writeFile(exec, dest, body);
    fresh.push(name);
  }

  if (fresh.length === 0) {
    return { kind: 'reused', note: `${reused.length} skill(s) already present` };
  }
  if (reused.length === 0) return { kind: 'installed', note: fresh.join(', ') };
  return { kind: 'mixed', note: `installed ${fresh.join(', ')}; reused ${reused.join(', ')}` };
}
