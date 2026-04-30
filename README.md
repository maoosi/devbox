# 👾📦 Devbox

Per-project Orbstack devbox for running Claude Code agents with scoped credentials.

## Quick start

Create a new Orbstack machine (Ubuntu, latest, **Isolate machine** on), open its shell, and run:

```bash
curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/install.sh | bash
```

The installer asks for the repo URL, picks a secrets manager, and walks you through pasting scoped tokens. At the end it prints the command to reconnect from your Mac.

## What you get

- **One repo per machine.** GitHub PAT, secrets-manager token, and clone are all scoped to a single repo.
- **Read-only or write git mode**, chosen at install. Write mode adds opt-in toggles (default off) for direct pushes to the default branch and branch deletes, enforced by a `pre-push` hook + a Claude deny on `git push --no-verify`.
- **Supply-chain hardening.** `npm/pnpm/yarn/pip/uv/cargo` are aliased through Socket Firewall; `ignore-scripts=true` is set globally.
- **Claude Code** with destructive ops (`git push --force`, `git reset --hard`, `npm publish`, …) denied.
- Tools: git, curl, bun, Node (LTS via fnm), pnpm, gh, Claude Code, plus optional Vite+, agent-browser, Socket Firewall, and one of Doppler / Infisical / none.

## Dry run

```bash
bun install
bun src/cli.ts --dry-run
```

Walks the prompts and prints every command/file the installer would run, without touching your system.

## Known gaps

- `bun install` is not wrapped by Socket Firewall. Prefer pnpm where you can.
- `ignore-scripts=true` breaks packages that legitimately need scripts (`sharp`, `puppeteer`, …). Per-package escape: `pnpm install --ignore-scripts=false <pkg>`.
- If `socket.dev` is unreachable, `sfw` fails closed. Emergency bypass: `unalias npm` for one shell.

</invoke>
