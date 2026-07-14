# 👾📦 Devbox

**Per-project development environments for running AI agents safely — one repo, one box, scoped tokens, guardrails on by default.**

Two flavors, one set of provisioning primitives:

| 📦 | ✨ |
| --- | --- |
| [`packages/upstash`](packages/upstash) | Local `devbox` CLI that provisions disposable remote workspaces on [Upstash Box](https://upstash.com/docs/box), driven by a `devbox.ts` config. |
| [`packages/ubuntu`](packages/ubuntu) | One-line interactive installer that turns any fresh Ubuntu ARM64 machine (e.g. an Orbstack VM) into a devbox. |
| [`packages/core`](packages/core) | Shared primitives: an `Executor` shell transport plus the setup modules and content generators both flavors run. |

## 🚀 Install

Remote workspaces on Upstash Box (from your Mac/laptop):

```sh
curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/packages/upstash/install.sh | bash
```

Local Ubuntu machine / VM (run on the machine itself):

```sh
curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/packages/ubuntu/install.sh | bash
```

See each package's README for the full guide.

## ✅ What you get (both flavors)

Everything below ships from [`@devbox/core`](packages/core) and applies whether the devbox is an Ubuntu machine or an Upstash box:

| ✨                          | 📦                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Per-project isolation**   | one devbox per repo, so clone, PAT, and secrets stay scoped to that single project                      |
| **Git safety mode**         | read-only or write, with a granular write policy (direct-push-to-main, branch deletion) enforced by `pre-push` / `pre-merge-commit` hooks |
| **Agent guardrails**        | Claude Code deny rules for risky commands like `git push --force`, `git reset --hard`, `npm publish`, … |
| **Supply chain defaults**   | `npm`/`pnpm`/`yarn`/`pip`/`uv`/`cargo` wrapped through Socket Firewall; `ignoreScripts = true` globally |
| **Agent workflow defaults** | project-scoped `~/AGENTS.md` conventions (12 default rules) and a GitHub MCP server                     |
| **Bundled skills**          | `code-review`, `code-simplify`, `code-checklist`, `code-changelog` in `~/.claude/skills/`               |
| **Core toolchain**          | Bun, Node LTS (via fnm, repo-pinned versions win), pnpm + yarn (via corepack)                           |
| **Agent tools (optional)**  | `agent-browser` (headless browser) and Vite+ — a prompt on Ubuntu, `agentBrowser()` / `vitePlus()` toolchain items on Upstash |
| **Secrets managers**        | Doppler or Infisical CLI with a read-only project-scoped token                                          |

Each flavor adds its own extras on top — the Ubuntu installer ships the `gh` PAT flow and Claude Code install; the Upstash CLI adds snapshots, throwaway workspaces, editor deep-links, and public URLs.

## ⚠️ Known gaps

- `bun install` is not wrapped by Socket Firewall. Prefer pnpm where you can.
- `ignore-scripts=true` breaks packages that legitimately need scripts (`sharp`, `puppeteer`, …). Per-package escape: `pnpm install --ignore-scripts=false <pkg>`.
- If `socket.dev` is unreachable, `sfw` fails closed. Emergency bypass: `command pnpm install …` (or `command npm install …`) skips the wrapper for one invocation.
- `sfw` only scans install-like subcommands. Runtime commands (`pnpm run`, `cargo build`, `npx`) bypass it so tools they spawn (Doppler, `gh`) hit the network directly.

## 🛠️ Development

Bun workspace — install once at the root:

```sh
bun install
bun run typecheck            # tsc across all packages
bun test                     # unit tests (core + ubuntu + upstash)
bun run test:smoke:ubuntu    # full installer inside Docker (all scenarios)
UPSTASH_BOX_API_KEY=... bun run test:smoke:upstash   # provisions a real box
```

Both flavors keep their own UX (interactive wizard vs config file) and their own transports (local bash vs Upstash Box exec); everything that provisions a dev environment lives in `@devbox/core`, typed against the `Executor` interface.
