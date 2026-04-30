#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { tools, selectTools } from "./tools/index.ts";
import type { Ctx, GitMode, GitWritePolicy, Tool } from "./tools/index.ts";
import { parseRepoUrl, writeEnv, writeShellInit } from "./env.ts";
import { cloneDir } from "./tools/repo.ts";
import { run, runInteractive } from "./exec.ts";
import { setDryRun, isDryRun } from "./dryrun.ts";

async function pickRepo(): Promise<Ctx["repo"]> {
  const v = await p.text({
    message: "GitHub repo URL?",
    placeholder: "https://github.com/owner/repo",
    validate: (s) =>
      !s ? "Required" : !parseRepoUrl(s) ? "Expected https://github.com/<owner>/<repo>" : undefined,
  });
  if (p.isCancel(v)) process.exit(1);
  return { url: v as string, ...parseRepoUrl(v as string)! };
}

async function pickGitMode(): Promise<GitMode> {
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

async function pickGitWritePolicy(): Promise<GitWritePolicy> {
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

async function pickSecretsManager(): Promise<Ctx["secretsManager"]> {
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

async function pickGitIdentity(): Promise<{ name: string; email: string }> {
  // Use whatever git already has as defaults so power users don't retype.
  // `force: true` so the read happens even under dry-run (it's introspection,
  // not an action — and skipping it would mean dry-run never has defaults).
  const existingName = (await run("git", ["config", "--global", "user.name"], { quiet: true, allowFail: true, force: true })).stdout.trim();
  const existingEmail = (await run("git", ["config", "--global", "user.email"], { quiet: true, allowFail: true, force: true })).stdout.trim();

  // clack quirk: passing both placeholder + initialValue causes typed input
  // to append to the initial value. Pass exactly one.
  const name = await p.text({
    message: "Git user.name?",
    ...(existingName
      ? { initialValue: existingName }
      : { placeholder: "Your Name" }),
    validate: (s) => (s && s.length >= 1 ? undefined : "Required"),
  });
  if (p.isCancel(name)) process.exit(1);

  const email = await p.text({
    message: "Git user.email?",
    ...(existingEmail
      ? { initialValue: existingEmail }
      : { placeholder: "you@example.com" }),
    validate: (s) => (s && /.+@.+\..+/.test(s) ? undefined : "Expected an email address"),
  });
  if (p.isCancel(email)) process.exit(1);

  return { name: (name as string).trim(), email: (email as string).trim() };
}

async function pickTools(secrets: Ctx["secretsManager"]): Promise<Tool[]> {
  // The chosen secrets manager auto-installs; the other one is hidden from the prompt.
  const isSecretsTool = (id: string) => id === "doppler" || id === "infisical";
  const optional = tools.filter((t) => !t.required && !isSecretsTool(t.id));
  const v = await p.multiselect({
    message: "Optional tools to install:",
    options: optional.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
    initialValues: optional.filter((t) => t.default).map((t) => t.id),
    required: false,
  });
  if (p.isCancel(v)) process.exit(1);
  return selectTools(tools, new Set(v as string[]), secrets);
}

async function main(): Promise<void> {
  process.umask(0o077);

  const argv = process.argv.slice(2);
  if (argv.includes("--dry-run") || argv.includes("-n")) setDryRun(true);

  p.intro(isDryRun() ? "👾📦 Devbox installer (dry-run)" : "👾📦 Devbox installer");

  const repo = await pickRepo();
  const git = await pickGitIdentity();
  const gitMode = await pickGitMode();
  const gitWritePolicy =
    gitMode === "write"
      ? await pickGitWritePolicy()
      : { pushMain: false, deleteBranches: false };
  const secretsManager = await pickSecretsManager();
  const selected = await pickTools(secretsManager);

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

  for (const tool of selected) {
    const s = p.spinner();
    s.start(tool.label);
    try {
      await tool.run(ctx);
      s.stop(`${tool.label} ✓`);
    } catch (err) {
      s.stop(`${tool.label} ✗`);
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  // Apply git identity now that git is installed.
  await run("git", ["config", "--global", "user.name", git.name], { quiet: true });
  await run("git", ["config", "--global", "user.email", git.email], { quiet: true });

  await writeEnv(ctx.tokens);
  await writeShellInit({ exports: ctx.exports, aliases: ctx.aliases });

  // Final manual step: claude login (Anthropic OAuth — no API alternative).
  // Only when Claude Code was actually installed.
  if (selected.some((t) => t.id === "claude")) {
    p.log.info("Starting `claude login` — follow the OAuth flow in your browser.");
    if (!isDryRun()) {
      const code = await runInteractive("claude", ["login"]);
      if (code !== 0) {
        p.log.warn("`claude login` did not complete. Run it manually later.");
      }
    } else {
      p.log.info("[dry-run] would run: claude login");
    }
  }

  // Reconnect tips. Devbox runs on any Ubuntu host; we surface the Orbstack-on-Mac
  // path (the typical setup) plus a plain-SSH fallback. The shell function is
  // idempotent — paste it once and every future devbox reconnects with `devbox <slug>`.
  const target = cloneDir();
  p.note(
    [
      `# One-shot from your Mac (Orbstack):`,
      `orb shell devbox-${repo.slug} -d ${target}`,
      ``,
      `# Or paste this into your Mac's ~/.zshrc — works for every devbox:`,
      `devbox() { orb shell "devbox-$1" -d ${target}; }`,
      `# then: devbox ${repo.slug}`,
      ``,
      `# Plain SSH (any host):`,
      `ssh <host> -t "cd ${target} && exec bash -l"`,
    ].join("\n"),
    "Reconnect later",
  );

  p.outro("All set. Open a fresh shell (or run `exec bash -l`) to pick up env + aliases.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
