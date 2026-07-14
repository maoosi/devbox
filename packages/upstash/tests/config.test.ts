import { describe, test, expect, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigError, loadLocalEnv, parseEnvFile, resolveConfig } from '../src/config';
import { agentBrowser, bun, command, devbox, doppler, pnpm, pulumi, vitePlus } from '../src/index';

const BASE = {
  name: 'demo',
  repository: { slug: 'octocat/hello' },
};

describe('resolveConfig', () => {
  test('applies defaults', () => {
    const cfg = resolveConfig(devbox(BASE));
    expect(cfg.owner).toBe('octocat');
    expect(cfg.repo).toBe('hello');
    expect(cfg.branch).toBe('main');
    expect(cfg.workdir).toBe('hello');
    expect(cfg.mode).toBe('write');
    expect(cfg.writePolicy).toEqual({ pushMain: false, deleteBranches: false });
    expect(cfg.toolchain).toEqual(['bun', 'pnpm', 'yarn']);
    expect(cfg.secrets).toEqual([]);
    expect(cfg.editor).toBe('zed');
    expect(cfg.baseBoxName).toBe('devbox-demo');
    expect(cfg.snapshotName).toBe('devbox-demo-base');
  });

  test('resolves toolchain, secrets and setup constructors', () => {
    const cfg = resolveConfig(
      devbox({
        ...BASE,
        toolchain: [bun(), pnpm(), pulumi(), vitePlus(), agentBrowser()],
        secrets: [doppler({ token: 'dp.st.xyz' })],
        setup: [pulumi.install({ cwd: 'infra' }), command('bun install')],
      }),
    );
    expect(cfg.toolchain).toEqual(['bun', 'pnpm', 'pulumi', 'vite-plus', 'agent-browser']);
    expect(cfg.secrets).toEqual([{ provider: 'doppler', token: 'dp.st.xyz' }]);
    expect(cfg.setup).toHaveLength(2);
  });

  test('writePolicy: partial object fills missing keys with false', () => {
    const cfg = resolveConfig(devbox({ ...BASE, writePolicy: { pushMain: true } }));
    expect(cfg.writePolicy).toEqual({ pushMain: true, deleteBranches: false });
  });

  test('writePolicy: rejects non-boolean values', () => {
    expect(() =>
      resolveConfig({ ...BASE, writePolicy: { pushMain: 'yes' } }),
    ).toThrow(ConfigError);
  });

  test('writePolicy: rejects non-object', () => {
    expect(() => resolveConfig({ ...BASE, writePolicy: 'strict' })).toThrow(ConfigError);
  });

  test('rejects invalid name and slug with accumulated errors', () => {
    try {
      resolveConfig({ name: 'Bad Name', repository: { slug: 'nope' } });
      throw new Error('expected ConfigError');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as Error).message;
      expect(msg).toContain('name:');
      expect(msg).toContain('repository.slug:');
    }
  });

  test('rejects missing secret token with a helpful message', () => {
    expect(() =>
      resolveConfig({ ...BASE, secrets: [{ kind: 'secret', provider: 'doppler', token: '' }] }),
    ).toThrow(/token is missing or empty/);
  });

  test('repository.token flows into githubToken; absent → empty (no env fallback)', () => {
    const prev = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'ghp_from_env_must_be_ignored';
    try {
      expect(resolveConfig(devbox(BASE)).githubToken).toBe('');
      expect(
        resolveConfig(
          devbox({ ...BASE, repository: { ...BASE.repository, token: 'ghp_explicit' } }),
        ).githubToken,
      ).toBe('ghp_explicit');
    } finally {
      if (prev === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prev;
    }
  });

  test('repository.token: rejects non-string', () => {
    expect(() =>
      resolveConfig({ ...BASE, repository: { slug: 'octocat/hello', token: 42 } }),
    ).toThrow(ConfigError);
  });
});

describe('parseEnvFile', () => {
  test('parses KEY=value with export prefix, quotes, and comments', () => {
    const vars = parseEnvFile(
      [
        '# comment',
        '',
        'UPSTASH_BOX_API_KEY=plain',
        "GITHUB_TOKEN='single quoted'",
        'export DOPPLER_TOKEN="double quoted"',
        'not a valid line',
      ].join('\n'),
    );
    expect(vars).toEqual({
      UPSTASH_BOX_API_KEY: 'plain',
      GITHUB_TOKEN: 'single quoted',
      DOPPLER_TOKEN: 'double quoted',
    });
  });
});

describe('loadLocalEnv', () => {
  let tmp: string | undefined;
  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
    tmp = undefined;
    delete process.env.DEVBOX_TEST_FILE_ONLY;
    delete process.env.DEVBOX_TEST_SHELL_WINS;
  });

  test('injects file values but never overrides the shell env', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'devbox-localenv-'));
    await fs.writeFile(
      path.join(tmp, 'devbox.local.env'),
      'DEVBOX_TEST_FILE_ONLY=from-file\nDEVBOX_TEST_SHELL_WINS=from-file\n',
    );
    process.env.DEVBOX_TEST_SHELL_WINS = 'from-shell';
    loadLocalEnv(tmp);
    expect(process.env.DEVBOX_TEST_FILE_ONLY).toBe('from-file');
    expect(process.env.DEVBOX_TEST_SHELL_WINS).toBe('from-shell');
  });

  test('no-op when the file is absent', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'devbox-localenv-'));
    loadLocalEnv(tmp);
    expect(process.env.DEVBOX_TEST_FILE_ONLY).toBeUndefined();
  });
});
