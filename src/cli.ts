#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { tools } from "./tools/index.ts";
import type { Ctx, Tool } from "./tools/index.ts";
import { parseRepoUrl, writeEnv, writeShellInit } from "./env.ts";
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

async function pickTools(secrets: Ctx["secretsManager"]): Promise<Tool[]> {
  // The chosen secrets manager auto-installs; the other one is hidden.
  // Both are filtered out of the multi-select so we don't ask twice.
  const isSecretsTool = (id: string) => id === "doppler" || id === "infisical";
  const auto = new Set<string>(secrets !== "none" ? [secrets] : []);

  const optional = tools.filter((t) => !t.required && !isSecretsTool(t.id));
  const v = await p.multiselect({
    message: "Optional tools to install:",
    options: optional.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
    initialValues: optional.filter((t) => t.default).map((t) => t.id),
    required: false,
  });
  if (p.isCancel(v)) process.exit(1);
  const picked = new Set(v as string[]);
  // Preserve the canonical order from `tools` so claude still runs last.
  return tools.filter((t) => t.required || picked.has(t.id) || auto.has(t.id));
}

async function main(): Promise<void> {
  process.umask(0o077);

  const argv = process.argv.slice(2);
  if (argv.includes("--dry-run") || argv.includes("-n")) setDryRun(true);

  p.intro(isDryRun() ? "devbox installer (dry-run)" : "devbox installer");

  const repo = await pickRepo();
  const secretsManager = await pickSecretsManager();
  const selected = await pickTools(secretsManager);

  const ctx: Ctx = {
    repo,
    secretsManager,
    tokens: {},
    exports: [],
    aliases: [],
    mcpServers: {},
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

  await writeEnv(ctx.tokens);
  await writeShellInit({ exports: ctx.exports, aliases: ctx.aliases });

  p.note(
    [
      `1. source ~/.bashrc            (or open a new shell)`,
      `2. claude login                (opens Anthropic OAuth in your browser)`,
      `3. git config --global user.name "Your Name"`,
      `   git config --global user.email "you@example.com"`,
    ].join("\n"),
    "Next steps inside this devbox",
  );

  p.note(
    `orb shell devbox-${repo.slug} -d /home/devbox/repos/${repo.slug}`,
    "Reconnect later from your Mac",
  );

  p.outro("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
