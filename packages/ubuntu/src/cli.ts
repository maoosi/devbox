#!/usr/bin/env bun
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { upsertEnv } from "@devbox/core";
import { tools, selectTools } from "./tools/index.ts";
import type { Ctx, GitMode, GitWritePolicy, Tool, ToolStatus } from "./tools/index.ts";
import { home, parseRepoUrl, writeShellInit, writeSystemEnv } from "./env.ts";
import { cloneDir, cloneDirDisplay } from "./tools/repo.ts";
import { run, runInteractive } from "./exec.ts";
import { LocalExecutor } from "./executor.ts";
import { loadScenario, type Scenario } from "./scenario.ts";
import packageJson from "../package.json";

async function pickRepo(preset?: Scenario["repo"]): Promise<Ctx["repo"]> {
  if (preset) return preset;
  const v = await p.text({
    message: "GitHub repo URL?",
    placeholder: "https://github.com/owner/repo",
    validate: (s) =>
      !s ? "Required" : !parseRepoUrl(s) ? "Expected https://github.com/<owner>/<repo>" : undefined,
  });
  if (p.isCancel(v)) process.exit(1);
  return { url: v as string, ...parseRepoUrl(v as string)! };
}

async function pickGitMode(preset?: GitMode): Promise<GitMode> {
  if (preset) return preset;
  const v = await p.select({
    message: "Should the agent be able to write to git in this repo?",
    initialValue: "write",
    options: [
      {
        value: "write",
        label: "Write — agent commits, pushes, opens PRs",
        hint: "PAT scoped to write contents + PRs",
      },
      {
        value: "read-only",
        label: "Read-only — agent edits files; you handle git",
        hint: "PAT scoped to read; agent push/commit/PR-create denied",
      },
    ],
  });
  if (p.isCancel(v)) process.exit(1);
  return v as GitMode;
}

async function pickGitWritePolicy(preset?: GitWritePolicy): Promise<GitWritePolicy> {
  if (preset) return preset;
  const v = await p.multiselect({
    message: "Extra write permissions (default: off)",
    options: [
      {
        value: "pushMain",
        label: "Allow direct pushes to the default branch (skip PR review)",
      },
      {
        value: "deleteBranches",
        label: "Allow deleting branches (local + remote)",
      },
    ],
    initialValues: [],
    required: false,
  });
  if (p.isCancel(v)) process.exit(1);
  const picked = new Set(v as string[]);
  return {
    pushMain: picked.has("pushMain"),
    deleteBranches: picked.has("deleteBranches"),
  };
}

async function pickSecretsManager(preset?: Ctx["secretsManager"]): Promise<Ctx["secretsManager"]> {
  if (preset) return preset;
  const v = await p.select({
    message: "Secrets manager?",
    initialValue: "doppler",
    options: [
      { value: "doppler", label: "Doppler" },
      { value: "infisical", label: "Infisical" },
      { value: "none", label: "None (use a local .env)" },
    ],
  });
  if (p.isCancel(v)) process.exit(1);
  return v as Ctx["secretsManager"];
}

async function pickGitIdentity(preset?: {
  name: string;
  email: string;
}): Promise<{ name: string; email: string }> {
  if (preset) return preset;
  // Use whatever git already has as defaults so power users don't retype.
  // `force: true` so the read happens even under dry-run (it's introspection,
  // not an action — and skipping it would mean dry-run never has defaults).
  const existingName = (
    await run("git", ["config", "--global", "user.name"], {
      quiet: true,
      allowFail: true,
    })
  ).stdout.trim();
  const existingEmail = (
    await run("git", ["config", "--global", "user.email"], {
      quiet: true,
      allowFail: true,
    })
  ).stdout.trim();

  // clack quirk: passing both placeholder + initialValue causes typed input
  // to append to the initial value. Pass exactly one.
  const name = await p.text({
    message: "Git user.name?",
    ...(existingName ? { initialValue: existingName } : { placeholder: "Your Name" }),
    validate: (s) => (s && s.length >= 1 ? undefined : "Required"),
  });
  if (p.isCancel(name)) process.exit(1);

  const email = await p.text({
    message: "Git user.email?",
    ...(existingEmail ? { initialValue: existingEmail } : { placeholder: "you@example.com" }),
    validate: (s) => (s && /.+@.+\..+/.test(s) ? undefined : "Expected an email address"),
  });
  if (p.isCancel(email)) process.exit(1);

  return { name: (name as string).trim(), email: (email as string).trim() };
}

async function pickTools(secrets: Ctx["secretsManager"], presetIds?: string[]): Promise<Tool[]> {
  // The chosen secrets manager auto-installs; the other one is hidden from the prompt.
  const isSecretsTool = (id: string) => id === "doppler" || id === "infisical";
  if (presetIds) return selectTools(tools, new Set(presetIds), secrets);
  const optional = tools.filter((t) => !t.required && !isSecretsTool(t.id));
  const v = await p.multiselect({
    message: "Optional tools to install:",
    options: optional.map((t) => ({
      value: t.id,
      label: t.label,
      hint: t.hint,
    })),
    initialValues: optional.filter((t) => t.default).map((t) => t.id),
    required: false,
  });
  if (p.isCancel(v)) process.exit(1);
  return selectTools(tools, new Set(v as string[]), secrets);
}

async function main(): Promise<void> {
  process.umask(0o077);

  const argv = process.argv.slice(2);

  // --scenario <path>: load a JSON file that supplies every prompt answer.
  // Used by the smoke-test harness (tests/smoke/) to drive the installer
  // non-interactively against a clean Ubuntu container.
  let scenario: Scenario | null = null;
  const sIdx = argv.indexOf("--scenario");
  if (sIdx !== -1) {
    const path = argv[sIdx + 1];
    if (!path) throw new Error("--scenario requires a path argument");
    scenario = await loadScenario(path);
  }

  p.intro(`👾📦 Devbox installer ${packageJson.version}`);

  const repo = await pickRepo(scenario?.repo);
  const git = await pickGitIdentity(scenario?.gitIdentity);
  const gitMode = await pickGitMode(scenario?.gitMode);
  const gitWritePolicy =
    gitMode === "write"
      ? await pickGitWritePolicy(scenario?.gitWritePolicy)
      : { pushMain: false, deleteBranches: false };
  const secretsManager = await pickSecretsManager(scenario?.secretsManager);
  const selected = await pickTools(secretsManager, scenario?.selectedToolIds);

  const ctx: Ctx = {
    repo,
    secretsManager,
    gitMode,
    gitWritePolicy,
    tokens: {},
    exports: [],
    aliases: [],
    mcpServers: {},
    selectedToolIds: new Set(selected.map((t) => t.id)),
  };

  // Required tools that fail abort the install — the box is unusable without
  // them. Optional tool failures are non-fatal: the install completes, the
  // failure is shown in the end-of-run summary, and the user gets a working
  // devbox minus that one tool. Without this, a single regression in any
  // optional tool (e.g. agent-browser ARM64) takes the whole flow down and
  // tokens never get written.
  type ToolResult =
    | { id: string; label: string; status: "ok"; toolStatus: ToolStatus }
    | { id: string; label: string; status: "failed"; error: string };
  const results: ToolResult[] = [];
  let aborted: { tool: Tool; error: unknown } | null = null;

  // Spinner stamp per status. ✓ for new work, ↻ for a no-op reuse so the
  // user can see at a glance which tools actually ran on a re-run.
  const stamp = (s: ToolStatus): string => {
    const symbol =
      s.kind === "installed" ? "✓" : s.kind === "reused" ? "↻ reused" : "✓ partial reuse";
    return s.note ? `${symbol} — ${s.note}` : symbol;
  };

  try {
    for (const tool of selected) {
      const s = p.spinner();
      s.start(tool.label);
      try {
        const ret = await tool.run(ctx);
        const toolStatus: ToolStatus = ret ?? { kind: "installed" };
        s.stop(`${tool.label} ${stamp(toolStatus)}`);
        results.push({ id: tool.id, label: tool.label, status: "ok", toolStatus });
      } catch (err) {
        s.stop(`${tool.label} ✗`);
        const msg = err instanceof Error ? err.message : String(err);
        p.log.error(msg);
        results.push({ id: tool.id, label: tool.label, status: "failed", error: msg });
        if (tool.required) {
          aborted = { tool, error: err };
          break;
        }
      }
    }
  } finally {
    // Persist whatever state we have, even on abort. Order matters:
    // git identity may already be useful to a partially-set-up box.
    await run("git", ["config", "--global", "user.name", git.name], {
      quiet: true,
      allowFail: true,
    });
    await run("git", ["config", "--global", "user.email", git.email], {
      quiet: true,
      allowFail: true,
    });
    // Persist tokens into ~/.config/devbox/env (core's upsertEnv writes
    // `export KEY='v'` lines; the installer's umask 077 keeps it 0600).
    const exec = new LocalExecutor();
    for (const [key, value] of Object.entries(ctx.tokens)) {
      await upsertEnv(exec, key, value);
    }
    // Mirror tokens to /etc/environment so non-interactive SSH sessions
    // (e.g. Claude Code Desktop's remote integration) inherit GH_TOKEN
    // without needing .bashrc to source.
    await writeSystemEnv(ctx.tokens);
    await writeShellInit({ exports: ctx.exports, aliases: ctx.aliases, cdSlug: repo.slug });
  }

  if (aborted) {
    p.log.error(`Required tool failed: ${aborted.tool.label}. Install aborted.`);
    process.exit(1);
  }

  // Three-bucket end-of-run summary: Installed / Reused / Failed. Lets the
  // user tell at a glance whether a re-run actually changed anything (all
  // Reused = effective no-op) or which tools touched the system this run.
  const ok = results.filter((r): r is Extract<ToolResult, { status: "ok" }> => r.status === "ok");
  const failed = results.filter(
    (r): r is Extract<ToolResult, { status: "failed" }> => r.status === "failed",
  );
  const installedIds = ok.filter((r) => r.toolStatus.kind === "installed").map((r) => r.id);
  const reusedIds = ok.filter((r) => r.toolStatus.kind === "reused").map((r) => r.id);
  const mixedIds = ok.filter((r) => r.toolStatus.kind === "mixed").map((r) => r.id);
  const summaryLines: string[] = [];
  if (installedIds.length) summaryLines.push(`✓ installed: ${installedIds.join(", ")}`);
  if (mixedIds.length) summaryLines.push(`✓ partial reuse: ${mixedIds.join(", ")}`);
  if (reusedIds.length) summaryLines.push(`↻ reused (no-op): ${reusedIds.join(", ")}`);
  for (const f of failed) summaryLines.push(`⚠ failed: ${f.id} — ${f.error.split("\n")[0]}`);
  if (summaryLines.length > 0) p.note(summaryLines.join("\n"), "Tools");

  // Final manual step: claude login (Anthropic OAuth — no API alternative).
  // Only when Claude Code was actually installed, and only when not already
  // logged in. Claude Code writes ~/.claude/.credentials.json after a
  // successful OAuth — its presence is a reliable "already authed" signal.
  if (selected.some((t) => t.id === "claude")) {
    const credsPath = path.join(home(), ".claude", ".credentials.json");
    let alreadyAuthed = false;
    try {
      await fs.access(credsPath);
      alreadyAuthed = true;
    } catch {
      /* not authed yet */
    }
    if (alreadyAuthed) {
      p.log.info("Skipping `claude login` — already authenticated.");
    } else if (scenario) {
      p.log.info("Skipping `claude login` — scenario mode (smoke test).");
    } else {
      p.log.info("Starting `claude login` — follow the OAuth flow in your browser.");
      // Shell-level cd before exec — spawn's cwd option is honored by the OS,
      // but the `claude` shim re-chdirs to $HOME for the login subcommand, so
      // we hand it a cwd it can't easily undo. exec replaces bash with claude
      // so the cd-then-exec is atomic from claude's perspective.
      const dir = cloneDir(repo.slug);
      const code = await runInteractive("bash", ["-c", `cd "${dir}" && exec claude login`]);
      if (code !== 0) {
        p.log.warn("`claude login` did not complete. Run it manually later.");
      }
    }
  }

  // Reconnect tips. Orbstack auto-registers each VM under `<machine>@orb`
  // on the host's ssh config, so a plain `ssh` reconnect just works.
  p.note(
    [
      `# From your Mac (Orbstack):`,
      `ssh devbox-${repo.slug}@orb`,
      `# then once connected:`,
      `cd ${cloneDirDisplay(repo.slug)}`,
    ].join("\n"),
    "Reconnect later",
  );

  // SSH host fields for any remote SSH client (Claude Desktop, VS Code Remote,
  // Cursor, JetBrains Gateway, etc.). Orbstack exposes each VM on
  // 127.0.0.1:32222 with a generated key on the Mac host; the @orb shortcut
  // above doesn't fit that form, so spell it out. Always shown — even without
  // an agent CLI installed, the user may still want to attach a remote IDE.
  p.note(
    [
      `For Claude Desktop, VS Code Remote, Cursor, JetBrains Gateway, etc.`,
      ``,
      `Name:          devbox-${repo.slug}`,
      `SSH Host:      devbox-${repo.slug}@127.0.0.1`,
      `SSH Port:      32222`,
      `Identity File: ~/.orbstack/ssh/id_ed25519`,
    ].join("\n"),
    "Connect from a remote SSH client",
  );

  // bun can't mutate the parent SSH shell's env, so we print a command for
  // the user to run instead of spawning a nested bash. `source ~/.bashrc`
  // re-sources ~/.bashrc.d/devbox.sh (env file + exports + aliases + the
  // interactive auto-cd into ~/<slug>) without forking a new shell.
  p.outro("All set. Run `source ~/.bashrc` to pick up env + aliases.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
