#!/usr/bin/env bun
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { tools, selectTools } from "./tools/index.ts";
import type { Ctx, GitMode, GitWritePolicy, Tool } from "./tools/index.ts";
import { home, parseRepoUrl, writeEnv, writeShellInit } from "./env.ts";
import { cloneDir } from "./tools/repo.ts";
import { run, runInteractive } from "./exec.ts";
import { setDryRun, isDryRun } from "./dryrun.ts";
import { loadScenario, type Scenario } from "./scenario.ts";
import packageJson from "../package.json";

async function pickRepo(preset?: Scenario["repo"]): Promise<Ctx["repo"]> {
  if (preset) return preset;
  const v = await p.text({
    message: "GitHub repo URL?",
    placeholder: "https://github.com/owner/repo",
    validate: (s) =>
      !s
        ? "Required"
        : !parseRepoUrl(s)
        ? "Expected https://github.com/<owner>/<repo>"
        : undefined,
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

async function pickGitWritePolicy(
  preset?: GitWritePolicy
): Promise<GitWritePolicy> {
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

async function pickSecretsManager(
  preset?: Ctx["secretsManager"]
): Promise<Ctx["secretsManager"]> {
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
      force: true,
    })
  ).stdout.trim();
  const existingEmail = (
    await run("git", ["config", "--global", "user.email"], {
      quiet: true,
      allowFail: true,
      force: true,
    })
  ).stdout.trim();

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
    validate: (s) =>
      s && /.+@.+\..+/.test(s) ? undefined : "Expected an email address",
  });
  if (p.isCancel(email)) process.exit(1);

  return { name: (name as string).trim(), email: (email as string).trim() };
}

async function pickTools(
  secrets: Ctx["secretsManager"],
  presetIds?: string[]
): Promise<Tool[]> {
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
  if (argv.includes("--dry-run") || argv.includes("-n")) setDryRun(true);

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

  const drySuffix = isDryRun() ? " (dry-run)" : "";
  p.intro(`👾📦 Devbox installer ${packageJson.version}${drySuffix}`);

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
    | { id: string; label: string; status: "ok" }
    | { id: string; label: string; status: "failed"; error: string };
  const results: ToolResult[] = [];
  let aborted: { tool: Tool; error: unknown } | null = null;

  try {
    for (const tool of selected) {
      const s = p.spinner();
      s.start(tool.label);
      try {
        await tool.run(ctx);
        s.stop(`${tool.label} ✓`);
        results.push({ id: tool.id, label: tool.label, status: "ok" });
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
    await writeEnv(ctx.tokens);
    await writeShellInit({ exports: ctx.exports, aliases: ctx.aliases });
  }

  if (aborted) {
    p.log.error(`Required tool failed: ${aborted.tool.label}. Install aborted.`);
    process.exit(1);
  }

  const failed = results.filter((r): r is Extract<ToolResult, { status: "failed" }> => r.status === "failed");
  const okIds = results.filter((r) => r.status === "ok").map((r) => r.id).join(", ");
  const summaryLines: string[] = [];
  if (okIds) summaryLines.push(`✓ ${okIds}`);
  for (const f of failed) summaryLines.push(`⚠ ${f.id} — ${f.error.split("\n")[0]}`);
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
    } else if (isDryRun()) {
      p.log.info("[dry-run] would run: claude login");
    } else if (scenario) {
      p.log.info("Skipping `claude login` — scenario mode (smoke test).");
    } else {
      p.log.info(
        "Starting `claude login` — follow the OAuth flow in your browser."
      );
      const code = await runInteractive("claude", ["login"]);
      if (code !== 0) {
        p.log.warn("`claude login` did not complete. Run it manually later.");
      }
    }
  }

  // Reconnect tips. Orbstack auto-registers each VM under `<machine>@orb`
  // on the host's ssh config, so a plain `ssh` reconnect just works.
  const target = cloneDir();
  p.note(
    [
      `# From your Mac (Orbstack):`,
      `ssh devbox-${repo.slug}@orb`,
      `# then once connected:`,
      `cd ${target}`,
    ].join("\n"),
    "Reconnect later"
  );

  p.outro(
    "All set. Open a fresh shell (or run `exec bash -l`) to pick up env + aliases."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
