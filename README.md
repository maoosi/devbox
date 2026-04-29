# devbox

Per-project Orbstack devbox for running Claude Code agents with scoped credentials.

## Quick start

In the **Orbstack app** on your Mac, click "Create" and fill in the New Machine form:

- **Name** — `devbox-<repo-slug>`
- **Distribution** — Ubuntu
- **Version** — latest (e.g. 25.10)
- **Architecture** — arm64 (or your Mac's native)
- **Advanced → Isolate machine** — **on** (disables file sharing + host integration so a compromise stays in the box)

Open a shell in the new machine (Orbstack app → the machine → "Shell"), then run:

```bash
curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/install.sh | bash
```

The installer asks for the repo URL, picks a secrets manager, and walks you through pasting scoped tokens. At the end it prints the exact command to use next time on your Mac to reconnect.

## What's installed

| Category | Tools | Notes |
|---|---|---|
| Required | git, curl, bun, Node (LTS via fnm), pnpm, Claude Code, gh | always installed |
| Optional (default on) | Vite+, agent-browser, Socket Firewall, Doppler **or** Infisical | togglable |
| Optional (default off) | the unselected secrets manager | not installed |

## Security posture

- **GitHub** — fine-grained PAT scoped to one repo. Falls back to a classic PAT if your org disables FGPATs.
- **Secrets** — one of {Doppler, Infisical, none}, with a read-only service token scoped to one project + dev environment. The other CLI is not installed.
- **Supply chain** — `sfw` (Socket Firewall) wraps npm/pnpm/yarn/pip/uv/cargo and blocks known-malicious packages at install. `ignore-scripts=true` is set globally as a second layer.
- **Per-machine isolation** — each repo gets its own Orbstack machine with "Isolate machine" enabled. A compromise in one cannot reach another's tokens or your Mac's files.
- **Claude Code** — `defaultMode: auto`; destructive ops (`git push --force`, `git reset --hard`, `npm publish`) are denied.

## Known gaps

- `bun install` is not yet wrapped by Socket Firewall — prefer pnpm where you have the choice.
- `ignore-scripts=true` breaks packages that legitimately need scripts (e.g. `sharp`, `puppeteer`). Per-package escape: `pnpm install --ignore-scripts=false <pkg>`.
- If `socket.dev` is unreachable, `sfw` fails closed. Emergency bypass: `unalias npm` for one shell.
