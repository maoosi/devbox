import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ExecResult, Executor } from '../src/executor';
import { SHIPPED_SKILLS, setupSkills } from '../src/setup/skills';

class BashExecutor implements Executor {
  constructor(private home: string) {}
  async exec(script: string): Promise<ExecResult> {
    const proc = Bun.spawn(['bash', '-c', script], {
      env: { ...process.env, HOME: this.home },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { exitCode, output: stdout + stderr };
  }
}

let home: string;
let exec: BashExecutor;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'devbox-skills-'));
  exec = new BashExecutor(home);
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

const skillPath = (name: string) => path.join(home, '.claude', 'skills', name, 'SKILL.md');

describe('shipped skill templates', () => {
  test('every shipped skill has a template with name/description frontmatter', async () => {
    for (const name of SHIPPED_SKILLS) {
      const body = await fs.readFile(
        path.resolve(import.meta.dir, '..', 'templates', 'skills', name, 'SKILL.md'),
        'utf8',
      );
      expect(body.startsWith('---')).toBe(true);
      expect(body).toContain('name:');
      expect(body).toContain('description:');
    }
  });
});

describe('setupSkills', () => {
  test('fresh install writes every shipped skill', async () => {
    const status = await setupSkills(exec);
    expect(status.kind).toBe('installed');
    for (const name of SHIPPED_SKILLS) {
      const body = await fs.readFile(skillPath(name), 'utf8');
      expect(body.length).toBeGreaterThan(0);
    }
  });

  test('re-run is a no-op and preserves user edits', async () => {
    await setupSkills(exec);
    const target = skillPath(SHIPPED_SKILLS[0]);
    await fs.appendFile(target, '\n# user edit marker\n');
    const status = await setupSkills(exec);
    expect(status.kind).toBe('reused');
    expect(await fs.readFile(target, 'utf8')).toContain('# user edit marker');
  });

  test('missing skills are backfilled without touching existing ones', async () => {
    await setupSkills(exec);
    const kept = skillPath(SHIPPED_SKILLS[0]);
    await fs.appendFile(kept, '\n# keep me\n');
    await fs.rm(path.dirname(skillPath(SHIPPED_SKILLS[1])), { recursive: true });
    const status = await setupSkills(exec);
    expect(status.kind).toBe('mixed');
    expect(await fs.readFile(kept, 'utf8')).toContain('# keep me');
    expect(await fs.readFile(skillPath(SHIPPED_SKILLS[1]), 'utf8')).toContain('name:');
  });
});
