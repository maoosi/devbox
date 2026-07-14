# 👾📦 Devbox (Upstash Box)

**A small, opinionated CLI for disposable remote development environments on [Upstash Box](https://upstash.com/docs/box).**

Provision a base box once (repo, toolchain, secrets, agent guardrails), snapshot it, then spin up throwaway workspaces from that snapshot in seconds. No local state — Upstash is the source of truth.

The provisioning defaults — git safety hooks, agent guardrails, Socket Firewall + `ignore-scripts`, `~/AGENTS.md` conventions, GitHub MCP, toolchain, Doppler/Infisical — come from [`@devbox/core`](../core), shared with the [Ubuntu flavor](../ubuntu); see the [root README](../../README.md) for the full list and known gaps.

## 🚀 Install

```sh
curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/packages/upstash/install.sh | bash
```

Installs the monorepo to `~/.devbox` (re-run to update) and puts the `devbox` CLI on your PATH. Installs [Bun](https://bun.sh) if missing. Overridable via `DEVBOX_REPO`, `DEVBOX_BRANCH`, `DEVBOX_HOME`.

From source (development), at the monorepo root:

```sh
bun install
cd packages/upstash && bun link
```

Optional: `sshpass` (`brew install sshpass`) so `devbox ssh` logs in automatically — without it, the SSH password is your `UPSTASH_BOX_API_KEY`.

## 🔑 Credentials

Put per-project credentials in a `devbox.local.env` next to `devbox.ts` (**gitignore it** — `devbox doctor` checks), or export them in your shell (shell wins over the file):

```sh
# devbox.local.env
UPSTASH_BOX_API_KEY=...   # required — also the SSH password for boxes
GITHUB_TOKEN=...          # referenced by devbox.ts (repository.token)
INFISICAL_TOKEN=...       # referenced by devbox.ts (secrets)
```

The CLI loads this file before reading `devbox.ts`, so `process.env.X` references in the config just work. Nothing is read implicitly: the GitHub token only reaches the box if `repository.token` says so.

## ⚙️ Configure

Add a `devbox.ts` to your project root (see [examples/devbox.example.ts](examples/devbox.example.ts)). No install step needed in the project — the CLI resolves the `'devbox'` import itself.

For editor autocomplete/types, optionally run `bun link @devbox/upstash` in the project and add a path alias to its `tsconfig.json`:

```jsonc
{ "compilerOptions": { "paths": { "devbox": ["./node_modules/@devbox/upstash/src/index.ts"] } } }
```

```ts
import { devbox, bun, pnpm, infisical, command } from 'devbox';

export default devbox({
  name: 'myapp',
  repository: {
    slug: 'me/myapp',
    branch: 'main',
    // Clone auth + GitHub MCP; omit for public repos.
    token: process.env.GITHUB_TOKEN,
  },
  mode: 'write', // or 'read-only'
  // Optional: relax what write mode may do (default: strict — no direct
  // pushes/merges to the default branch, no branch deletion).
  // writePolicy: { pushMain: true, deleteBranches: true },
  secrets: [infisical({ token: process.env.INFISICAL_TOKEN! })],
  // Also available: pulumi(), vitePlus(), agentBrowser() (Chromium baked into the snapshot).
  toolchain: [bun(), pnpm()],
  setup: [command('bun install')],
  editor: 'zed',
});
```

The bundled Claude Code skills (`code-review`, `code-simplify`, `code-checklist`, `code-changelog`) are installed on every box automatically.

## 🧰 Use

```sh
devbox init                      # create + provision the base box, SSH in
devbox snapshot                  # freeze the base box as the base snapshot

devbox create fix-auth --branch fix/auth   # workspace from the snapshot (idempotent)
devbox list                      # name, status, branch, age
devbox ssh fix-auth              # interactive shell
devbox exec fix-auth -- bun test # run a command, exit code propagated
devbox pull fix-auth             # apply the box's uncommitted changes to this
                                 # checkout as a git patch (--stat to preview)
devbox open fix-auth             # open in zed / code (--editor to override)
devbox url fix-auth 5173         # public URL for a port (pipe-safe: | pbcopy)
devbox delete fix-auth           # remove the workspace

devbox doctor                    # diagnose config, credentials, CLIs, remote state
devbox reset                     # delete snapshot + all project boxes (confirms)
```

Run `devbox help` for the full reference.

## 🧪 Tests

```sh
bun run typecheck                          # TypeScript, no emit (run in packages/upstash)
bun test tests                             # config/DSL unit tests
UPSTASH_BOX_API_KEY=... bun run test:smoke # creates a throwaway box, provisions it
                                           # (SMOKE_AGENT_BROWSER=1 also installs
                                           # agent-browser + Chromium and drives a page)
                                           # twice (idempotency), ~19 assertions,
                                           # deletes it — uses dummy app tokens
```

## 📝 Notes

- Secret tokens and the git remote URL are baked into the base snapshot. After rotating tokens or changing `devbox.ts`, run `devbox init` then `devbox snapshot --force`; existing workspaces keep the old values.
- The base box is kept (paused) after `devbox snapshot` — it's how the snapshot is rediscovered without local state.
- `devbox pull` covers **uncommitted** changes in the workspace (including new files, `.gitignore` respected) — the natural companion to `mode: 'read-only'`, where the box can't push. Nothing is committed locally; review and commit yourself. Changes already committed on the box aren't included — push those from the box (write mode) instead.
