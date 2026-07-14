import type { Box } from '@upstash/box';
import {
  ensureLine,
  folderExists,
  runScript,
  setupAgentBrowser,
  setupConventions,
  setupDoppler,
  setupGitSafety,
  setupGuardrails,
  setupInfisical,
  setupMcp,
  setupPulumi,
  setupSkills,
  setupSocket,
  setupSupplyChain,
  setupToolchain,
  setupVitePlus,
  shellQuote,
  upsertEnv,
  type Ctx,
  type SetupStatus,
} from '@devbox/core';
import type { ResolvedConfig } from './config';
import type { SetupStep } from './index';
import { BoxExecutor } from './executor';

function stepScript(step: SetupStep, workdir: string): string {
  const dir = step.cwd ? `${workdir}/${step.cwd}` : workdir;
  const cd = `cd ${shellQuote(dir)}`;
  if (step.step === 'pulumi-install') {
    return `${cd}\npulumi install${step.noDependencies ? ' --no-dependencies' : ''}`;
  }
  return `${cd}\n${step.command}`;
}

function logStatus(label: string, s: SetupStatus) {
  console.log(`${label}: ${s.kind}${s.note ? ` — ${s.note}` : ''}`);
}

export async function provisionBox(box: Box, cfg: ResolvedConfig) {
  const exec = new BoxExecutor(box);
  const ctx: Ctx = {
    workdir: cfg.workdir,
    gitMode: cfg.mode,
    gitWritePolicy: cfg.writePolicy,
    toolchain: cfg.toolchain,
    secrets: cfg.secrets.map((s) => s.provider),
    githubToken: cfg.githubToken,
  };

  // 1. Clone repo if missing (token embedded only when present, so public repos
  //    and the dummy-cred smoke test work too).
  if (!(await folderExists(exec, cfg.workdir))) {
    console.log(`Cloning repo: ${cfg.owner}/${cfg.repo}`);
    const auth = cfg.githubToken ? `${cfg.githubToken}@` : '';
    await box.git.clone({
      repo: `https://${auth}github.com/${cfg.owner}/${cfg.repo}`,
      branch: cfg.branch,
    });
    if (cfg.workdir !== cfg.repo) {
      await box.exec.command(`mv ${shellQuote(cfg.repo)} ${shellQuote(cfg.workdir)}`);
    }
    await box.exec.command(`sudo chmod 755 /workspace`);
  }

  // 2. Persist env file + GH_TOKEN; source it from ~/.bashrc for SSH/agent shells.
  console.log('Configuring environment...');
  if (!cfg.githubToken) {
    console.log(
      'No repository.token — cloned without auth; GH_TOKEN and the GitHub MCP are skipped.',
    );
  }
  await ensureLine(
    exec,
    '$HOME/.bashrc',
    'devbox/env',
    '[ -f "$HOME/.config/devbox/env" ] && . "$HOME/.config/devbox/env" # devbox/env',
  );
  if (cfg.githubToken) await upsertEnv(exec, 'GH_TOKEN', cfg.githubToken);

  // 3. Toolchain (heavy node provisioning gated by a missing node_modules, as before).
  const needsSetup =
    cfg.setup.length > 0 && !(await folderExists(exec, `${cfg.workdir}/node_modules`));
  logStatus(
    'Toolchain',
    await setupToolchain(exec, ctx, { provisionWorkdir: needsSetup ? cfg.workdir : undefined }),
  );
  if (cfg.toolchain.includes('pulumi')) logStatus('Pulumi', await setupPulumi(exec));
  if (cfg.toolchain.includes('vite-plus')) logStatus('Vite+', await setupVitePlus(exec));
  if (cfg.toolchain.includes('agent-browser')) {
    logStatus('agent-browser', await setupAgentBrowser(exec));
  }

  // 4. Supply-chain defaults + Socket Firewall (before setup so installs are script-safe).
  logStatus('Supply-chain defaults', await setupSupplyChain(exec));
  logStatus('Socket Firewall', await setupSocket(exec));

  // 5. Secret managers.
  for (const secret of cfg.secrets) {
    if (secret.provider === 'infisical') {
      logStatus('Infisical', await setupInfisical(exec, secret.token));
    } else {
      logStatus('Doppler', await setupDoppler(exec, secret.token));
    }
  }

  // 6. Repo-specific setup steps.
  if (needsSetup) {
    console.log('Running setup steps...');
    for (const step of cfg.setup) {
      await runScript(exec, stepScript(step, cfg.workdir));
    }
  }

  // 7. Git safety hooks.
  logStatus('Git safety', await setupGitSafety(exec, ctx));

  // 8. Agent defaults (claude + codex are preinstalled on upstash boxes).
  logStatus('Guardrails', await setupGuardrails(exec, ctx));
  logStatus('Skills', await setupSkills(exec));
  logStatus(
    'Conventions',
    await setupConventions(exec, {
      repo: { owner: cfg.owner, name: cfg.repo },
      gitMode: ctx.gitMode,
      gitWritePolicy: ctx.gitWritePolicy,
      secrets: ctx.secrets,
      sections: { github: true, agentBrowser: false, packageInstalls: true },
      claudeShim: true,
    }),
  );
  logStatus('GitHub MCP', await setupMcp(exec, ctx));
}
