import { Box } from '@upstash/box';
import { agentBrowser, bun, command, devbox, doppler, infisical, pnpm, yarn } from '../src/index';
import { resolveConfig } from '../src/config';
import { provisionBox } from '../src/provision';
import { fetchPatch } from '../src/commands/pull';
import { BoxExecutor } from '../src/executor';
import { ENV_PREAMBLE, shellQuote } from '@devbox/core';

// ── Dummy app credentials — never real. The only real value needed is the
//    Upstash platform key (UPSTASH_BOX_API_KEY in the env) so a throwaway box can
//    be created and torn down. No secret manager / real app tokens are used. ──
const GITHUB_TOKEN = 'ghp_smoke_dummy_000000000000000000000000';

// SMOKE_AGENT_BROWSER=1 additionally provisions agent-browser + Chromium
// (~300MB into the throwaway box) and drives a real page. Opt-in: it roughly
// doubles the provisioning time and needs outbound network from the box.
const WITH_BROWSER = process.env.SMOKE_AGENT_BROWSER === '1';

const NAME = 'devbox-smoke';
const WORKDIR = 'smoke-repo';
const ZERO = '0'.repeat(40);

type Check = { label: string; ok: boolean; detail: string };
const checks: Check[] = [];

async function sh(box: Box, script: string) {
  // Merge stderr into stdout: the box's Run.result returns ONLY stderr when it is
  // non-empty, which would otherwise hide the stdout markers our checks look for.
  return box.exec.command(`bash -c ${shellQuote(`exec 2>&1\n${script}`)}`);
}

/** Non-interactive check with our env preamble (mirrors automation). */
async function check(
  box: Box,
  label: string,
  cmd: string,
  opts: { contains?: string; exitCode?: number } = {},
) {
  const r = await sh(box, `${ENV_PREAMBLE}\n${cmd}`);
  record(label, r, opts);
}

/** Interactive check (`bash -ic`) so real ~/.bashrc sourcing is exercised. */
async function checkInteractive(
  box: Box,
  label: string,
  cmd: string,
  opts: { contains?: string } = {},
) {
  const r = await sh(box, `bash -ic ${shellQuote(cmd)}`);
  record(label, r, opts);
}

function record(label: string, r: { exitCode: number | null; result: string }, opts: { contains?: string; exitCode?: number }) {
  const out = (r.result || '').trim();
  const wantExit = opts.exitCode ?? 0;
  let ok = r.exitCode === wantExit;
  if (ok && opts.contains) ok = out.includes(opts.contains);
  checks.push({ label, ok, detail: `exit=${r.exitCode} ${out.slice(0, 200).replace(/\n/g, ' ⏎ ')}` });
  console.log(`${ok ? '✓' : '✗'} ${label}`);
}

async function seedRepo(box: Box) {
  console.log('Seeding local repo...');
  const pkg = JSON.stringify(
    { name: 'smoke', version: '0.0.0', private: true, packageManager: 'pnpm@9.0.0' },
    null,
    2,
  );
  const pkgB64 = Buffer.from(pkg, 'utf8').toString('base64');
  const r = await sh(
    box,
    [
      'set -e',
      `mkdir -p ${WORKDIR}`,
      `cd ${WORKDIR}`,
      'git init -q',
      'git config user.email smoke@example.com',
      'git config user.name smoke',
      `printf %s ${shellQuote(pkgB64)} | base64 -d > package.json`,
      `printf '22\\n' > .node-version`,
      'git add -A',
      'git commit -qm init',
      'git branch -M main',
      'git remote add origin https://github.com/smoke/local.git',
      'git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main',
    ].join('\n'),
  );
  if (r.exitCode !== 0) throw new Error(`seed failed: ${r.result}`);
}

async function runAssertions(box: Box) {
  console.log('\nRunning assertions...\n');

  // Toolchain (command -v resolves shims without triggering a corepack download)
  await check(box, 'toolchain: node/bun/pnpm/yarn resolve', `for t in node bun pnpm yarn; do command -v $t >/dev/null || { echo "MISSING $t"; exit 1; }; done; echo OK`, { contains: 'OK' });

  // Env wiring (interactive → proves ~/.bashrc sources ~/.config/devbox/env)
  await checkInteractive(box, 'env: GH_TOKEN present in interactive shell', 'echo "GH=$GH_TOKEN"', { contains: 'ghp_smoke_dummy' });

  // Supply chain
  await check(box, 'supply-chain: npm ignore-scripts=true', `test "$(npm config get ignore-scripts)" = "true" && echo OK`, { contains: 'OK' });
  await check(box, 'supply-chain: bunfig ignoreScripts', `grep -q 'ignoreScripts = true' "$HOME/.bunfig.toml" && echo OK`, { contains: 'OK' });

  // Socket Firewall
  await check(box, 'socket: sfw installed', `sfw --version >/dev/null 2>&1 && echo OK`, { contains: 'OK' });
  await checkInteractive(box, 'socket: npm wrapper active', 'type npm', { contains: 'function' });

  // Git safety (behavioral, offline)
  const hook = `cd ${WORKDIR}`;
  await check(box, 'git-safety: pre-push executable', `test -x ${WORKDIR}/.git/hooks/pre-push && echo OK`, { contains: 'OK' });
  await check(box, 'git-safety: blocks push to main', `${hook}; if printf '%s\\n' 'refs/heads/main aaa refs/heads/main bbb' | bash .git/hooks/pre-push origin url; then echo ALLOWED; else echo BLOCKED; fi`, { contains: 'BLOCKED' });
  await check(box, 'git-safety: allows feature branch', `${hook}; if printf '%s\\n' 'refs/heads/feature aaa refs/heads/feature bbb' | bash .git/hooks/pre-push origin url; then echo ALLOWED; else echo BLOCKED; fi`, { contains: 'ALLOWED' });
  await check(box, 'git-safety: blocks deletion', `${hook}; if printf '%s\\n' 'refs/heads/feature ${ZERO} refs/heads/feature bbb' | bash .git/hooks/pre-push origin url; then echo ALLOWED; else echo BLOCKED; fi`, { contains: 'BLOCKED' });

  // Guardrails
  await check(box, 'guardrails: settings.json valid + deny rules', `node -e "JSON.parse(require('fs').readFileSync(process.env.HOME+'/.claude/settings.json','utf8'))" && grep -q 'git push --force' "$HOME/.claude/settings.json" && grep -q 'npm publish' "$HOME/.claude/settings.json" && echo OK`, { contains: 'OK' });

  // Agent defaults
  await check(box, 'conventions: AGENTS.md + CLAUDE.md import', `test -f "$HOME/AGENTS.md" && grep -q '@~/AGENTS.md' "$HOME/.claude/CLAUDE.md" && echo OK`, { contains: 'OK' });
  await check(box, 'mcp: github registered', `claude mcp list 2>/dev/null | grep -q github && echo OK`, { contains: 'OK' });

  // Secret CLIs (install + wiring; no live auth with dummy tokens)
  await check(box, 'secrets: infisical + doppler CLIs installed', `infisical --version >/dev/null 2>&1 && doppler --version >/dev/null 2>&1 && echo OK`, { contains: 'OK' });
  await checkInteractive(box, 'secrets: tokens present in shell', 'echo "$INFISICAL_TOKEN|$DOPPLER_TOKEN"', { contains: 'smoke' });

  // Setup steps (command() primitives ran in the workdir)
  await check(box, 'setup: command() step ran in workdir', `test -f ${WORKDIR}/.devbox-setup-marker && echo OK`, { contains: 'OK' });

  // agent-browser (opt-in — see WITH_BROWSER). One exec drives launch → open
  // → snapshot so the daemon Chromium spawns stays inside this session.
  if (WITH_BROWSER) {
    await check(box, 'agent-browser: CLI installed', `agent-browser --version >/dev/null 2>&1 && echo OK`, { contains: 'OK' });
    await check(box, 'agent-browser: drives a real page', `agent-browser open https://example.com >/dev/null 2>&1 && agent-browser snapshot; agent-browser close >/dev/null 2>&1 || true`, { contains: 'Example Domain' });
  }

  // Idempotency (provisionBox was run twice) → exactly one bashrc source line
  await check(box, 'idempotency: single devbox/env source line', `test "$(grep -c 'devbox/env' "$HOME/.bashrc")" = "1" && echo OK`, { contains: 'OK' });

  // pull: patch extraction over the real exec channel (unit tests cover the
  // git mechanics locally; this covers the Run.result transport + markers).
  // Runs last — it dirties the workdir, then restores it.
  await sh(box, `cd ${WORKDIR} && echo smoke-pull-change >> package.json && echo pulled > pull-new.txt`);
  const patch = await fetchPatch(new BoxExecutor(box), WORKDIR);
  checks.push({
    label: 'pull: patch captures box changes',
    ok: patch.includes('pull-new.txt') && patch.includes('smoke-pull-change'),
    detail: `${patch.length} bytes`,
  });
  console.log(`${patch.includes('pull-new.txt') ? '✓' : '✗'} pull: patch captures box changes`);
  await sh(box, `cd ${WORKDIR} && git checkout -q -- package.json && rm -f pull-new.txt`);
}

async function main() {
  // Fresh box
  try {
    const old = await Box.getByName(NAME);
    console.log(`Deleting leftover box ${old.id}...`);
    await old.delete();
  } catch {
    // none
  }

  console.log('Creating smoke box...');
  const box = await Box.create({ runtime: 'node', name: NAME, keepAlive: false, size: 'small' });

  try {
    await seedRepo(box);

    // Exercises the full DSL → validation → provisioning path the CLI uses.
    const config = resolveConfig(
      devbox({
        name: 'smoke',
        repository: { slug: 'smoke/local', branch: 'main', token: GITHUB_TOKEN },
        workdir: WORKDIR,
        mode: 'write',
        toolchain: [bun(), pnpm(), yarn(), ...(WITH_BROWSER ? [agentBrowser()] : [])],
        secrets: [
          infisical({ token: 'st.smoke.dummy.dummy' }),
          doppler({ token: 'dp.st.smoke.dummy' }),
        ],
        setup: [command('pnpm --version'), command('touch .devbox-setup-marker')],
      }),
    );

    console.log('Running provisionBox (1/2)...');
    await provisionBox(box, config);
    console.log('Running provisionBox (2/2, idempotency)...');
    await provisionBox(box, config);

    await runAssertions(box);
  } finally {
    console.log('\nDeleting smoke box...');
    await box.delete();
  }
}

await main();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${'─'.repeat(60)}`);
console.log(`Smoke test: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const c of failed) console.log(`  ✗ ${c.label}\n      ${c.detail}`);
  process.exit(1);
}
console.log('All checks passed ✓');
