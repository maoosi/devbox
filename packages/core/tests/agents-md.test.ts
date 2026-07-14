import { describe, test, expect } from 'bun:test';
import { buildAgentsMd, type AgentsMdOptions } from '../src/content/agents-md';

function opts(overrides: Partial<AgentsMdOptions> = {}): AgentsMdOptions {
  return {
    repo: { owner: 'octocat', name: 'hello' },
    gitMode: 'write',
    gitWritePolicy: { pushMain: false, deleteBranches: false },
    secrets: [],
    sections: { github: false, agentBrowser: false, packageInstalls: false },
    ...overrides,
  };
}

describe('buildAgentsMd', () => {
  test('header includes the repo identifier', () => {
    const md = buildAgentsMd(opts());
    expect(md).toContain('# Devbox conventions for octocat/hello');
    expect(md).toContain('dedicated to **octocat/hello**');
  });

  test('header falls back to a generic title without a repo', () => {
    const md = buildAgentsMd(opts({ repo: undefined }));
    expect(md).toContain('# Devbox conventions\n');
    expect(md).not.toContain('octocat');
  });

  test('denied-actions section is always present', () => {
    const md = buildAgentsMd(opts());
    expect(md).toContain('## Denied actions');
    expect(md).toContain('git push --force');
    expect(md).toContain('git push --no-verify');
  });

  test('default rules section is always present and lists all 12 rules', () => {
    const md = buildAgentsMd(opts());
    expect(md).toContain('## Default rules');
    for (let n = 1; n <= 12; n++) {
      expect(md).toContain(`### Rule ${n} —`);
    }
  });

  test('default rules appear before any tool-gated section', () => {
    const md = buildAgentsMd(
      opts({
        sections: { github: true, agentBrowser: true, packageInstalls: true },
        secrets: ['doppler'],
      }),
    );
    const rulesIdx = md.indexOf('## Default rules');
    const githubIdx = md.indexOf('## GitHub');
    const browserIdx = md.indexOf('## Browser');
    const packageIdx = md.indexOf('## Package installs');
    const secretsIdx = md.indexOf('## Secrets');
    const deniedIdx = md.indexOf('## Denied actions');
    expect(rulesIdx).toBeGreaterThan(-1);
    expect(rulesIdx).toBeLessThan(githubIdx);
    expect(rulesIdx).toBeLessThan(browserIdx);
    expect(rulesIdx).toBeLessThan(packageIdx);
    expect(rulesIdx).toBeLessThan(secretsIdx);
    expect(rulesIdx).toBeLessThan(deniedIdx);
  });

  test('denied-actions documents merge-into-main block when write+pushMain=false', () => {
    const md = buildAgentsMd(opts());
    expect(md).toContain('merges into the default branch');
    expect(md).toContain('gh pr merge');
  });

  test('denied-actions omits merge-into-main note when pushMain=true', () => {
    const md = buildAgentsMd(opts({ gitWritePolicy: { pushMain: true, deleteBranches: false } }));
    expect(md).not.toContain('merges into the default branch');
  });

  test('denied-actions omits merge-into-main note in read-only mode', () => {
    const md = buildAgentsMd(opts({ gitMode: 'read-only' }));
    expect(md).not.toContain('merges into the default branch');
  });

  test('github section appears iff enabled', () => {
    expect(buildAgentsMd(opts())).not.toContain('## GitHub');
    const md = buildAgentsMd(
      opts({ sections: { github: true, agentBrowser: false, packageInstalls: false } }),
    );
    expect(md).toContain('## GitHub');
  });

  test('agent-browser section appears iff enabled', () => {
    expect(buildAgentsMd(opts())).not.toContain('## Browser');
    const md = buildAgentsMd(
      opts({ sections: { github: false, agentBrowser: true, packageInstalls: false } }),
    );
    expect(md).toContain('## Browser');
    expect(md).toContain('agent-browser open http://localhost:3000');
    expect(md).toContain('agent-browser snapshot');
  });

  test('package-installs section appears iff enabled', () => {
    expect(buildAgentsMd(opts())).not.toContain('## Package installs');
    const md = buildAgentsMd(
      opts({ sections: { github: false, agentBrowser: false, packageInstalls: true } }),
    );
    expect(md).toContain('## Package installs');
  });

  test('secrets section names the chosen manager and is omitted when none', () => {
    expect(buildAgentsMd(opts())).not.toContain('## Secrets');
    expect(buildAgentsMd(opts({ secrets: ['doppler'] }))).toContain('Doppler is scoped');
    expect(buildAgentsMd(opts({ secrets: ['infisical'] }))).toContain('Infisical is scoped');
  });

  test('secrets section handles both managers together', () => {
    const md = buildAgentsMd(opts({ secrets: ['infisical', 'doppler'] }));
    expect(md).toContain('Infisical and Doppler are scoped');
  });

  test('does not leak disabled tool names into the document', () => {
    const md = buildAgentsMd(opts()); // nothing enabled
    expect(md).not.toContain('agent-browser');
    expect(md).not.toContain('sfw');
    expect(md).not.toContain('Doppler');
    expect(md).not.toContain('Infisical');
  });

  test('output differs when section selection changes', () => {
    const a = buildAgentsMd(opts());
    const b = buildAgentsMd(
      opts({ sections: { github: false, agentBrowser: true, packageInstalls: false } }),
    );
    expect(a).not.toBe(b);
  });

  test('output differs when secrets manager changes', () => {
    const a = buildAgentsMd(opts({ secrets: ['doppler'] }));
    const b = buildAgentsMd(opts({ secrets: ['infisical'] }));
    expect(a).not.toBe(b);
  });

  test('output differs when git policy changes', () => {
    const a = buildAgentsMd(opts({ gitWritePolicy: { pushMain: false, deleteBranches: false } }));
    const b = buildAgentsMd(opts({ gitWritePolicy: { pushMain: true, deleteBranches: false } }));
    expect(a).not.toBe(b);
  });
});
