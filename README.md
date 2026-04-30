# 👾📦 Devbox

Per-project devbox for running AI agents safely on any fresh Ubuntu machine.

## Quick start

On a fresh Ubuntu machine, open a shell as a regular user (not root) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/install.sh | bash
```

The installer asks for the repo URL, picks a secrets manager, and walks you through pasting scoped tokens. At the end it prints the command to reconnect.

## Recommended host: Orbstack on Mac

Devbox runs on any Ubuntu machine, but the cleanest setup is one Orbstack VM per repo on a Mac:

- In the **Orbstack app**, create a new machine: Ubuntu, latest, **Isolate machine** on (disables file sharing + host integration so a compromise stays in the VM).
- Open its shell, run the install command above.
- Reconnect later with `orb shell devbox-<slug> -d ~/repo`.

Plain SSH or any other Linux host works too — the install steps are identical.

## What you get

- **One repo per machine.** GitHub PAT, secrets-manager token, and clone are all scoped to a single repo.
- **Read-only or write git mode**, chosen at install. Write mode adds opt-in toggles (default off) for direct pushes to the default branch and branch deletes, enforced by a `pre-push` hook.
- **Supply-chain hardening.** `npm/pnpm/yarn/pip/uv/cargo` are aliased through Socket Firewall; `ignore-scripts=true` is set globally.
- **Destructive ops denied** at the agent layer (`git push --force`, `git reset --hard`, `npm publish`, …) for whichever agent CLI you install.
- Tools: git, curl, bun, Node (LTS via fnm), pnpm, gh, plus optional Claude Code, Vite+, agent-browser, Socket Firewall, and one of Doppler / Infisical / none.

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
