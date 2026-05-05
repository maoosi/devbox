# 👾📦 Devbox

**Per-project devbox for running AI agents safely on any fresh Ubuntu ARM64 machine.**

## 🚀 Quick start

On a fresh Ubuntu machine, open a shell as a regular user (not root) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/install.sh | bash
```

The installer asks for the repo URL, picks a secrets manager, and walks you through pasting scoped tokens. At the end it prints the command to reconnect.

## 🖥️ Recommended host: Orbstack on Mac

Devbox runs on any Ubuntu machine, but the cleanest setup is one Orbstack VM per repo on a Mac:

- In the **Orbstack app**, create a new machine: Ubuntu, latest, arm64, **Isolate machine**.
- Open its shell, run the install command above.
- Reconnect later with `ssh devbox-<slug>@orb`, then `cd ~/repo`.

Plain SSH or any other Linux host works too — the install steps are identical.

## ✅ What you get

### Default

| ✨ | 📦 |
| --- | --- |
| **Per-project isolation** | one Ubuntu machine per repo, so clone, PAT, and secrets stay scoped to that single project |
| **Fresh Ubuntu bootstrap** | starts from a clean Ubuntu host and sets up the devbox in one install flow |
| **Git safety mode** | read-only or write, chosen at install; write mode enforced by a `pre-push` hook |
| **Agent guardrails** | deny rules for risky commands like `git push --force`, `git reset --hard`, `npm publish`, … |
| **Supply chain defaults** | `npm`/`pnpm`/`yarn`/`pip`/`uv`/`cargo` aliased through Socket Firewall; `ignoreScripts = true` globally |
| **Agent workflow defaults** | writes project-scoped `~/AGENTS.md` conventions and wires a GitHub MCP server |
| **Core runtimes** | Bun, Node LTS (via fnm), pnpm |
| **GitHub tooling** | `gh` CLI with a repo-scoped fine-grained token flow |

### Optional

| ✨ | 📦 |
| --- | --- |
| **Agent CLIs** | Claude Code |
| **Agent tools** | `agent-browser`, extra skills |
| **Dev tools** | Vite+ |
| **Secrets manager** | Doppler or Infisical (one project, read-only token flow) |

## 🧪 Dry run

```bash
bun install
bun src/cli.ts --dry-run
```

Walks the prompts and prints every command/file the installer would run, without touching your system.

## ⚠️ Known gaps

- `bun install` is not wrapped by Socket Firewall. Prefer pnpm where you can.
- `ignore-scripts=true` breaks packages that legitimately need scripts (`sharp`, `puppeteer`, …). Per-package escape: `pnpm install --ignore-scripts=false <pkg>`.
- If `socket.dev` is unreachable, `sfw` fails closed. Emergency bypass: `unalias npm` for one shell.
