# 👾📦 Devbox (Ubuntu)

**Per-project devbox for running AI agents safely on any fresh Ubuntu ARM64 machine.**

## 🚀 Quick start

On a fresh Ubuntu machine, open a shell as a regular user (not root) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/packages/ubuntu/install.sh | bash
```

The installer asks for the repo URL, picks a secrets manager, and walks you through pasting scoped tokens. At the end it prints the command to reconnect.

## 🖥️ Recommended host: Orbstack on Mac

Devbox runs on any Ubuntu machine, but the cleanest setup is one Orbstack VM per repo on a Mac:

- In the **Orbstack app**, create a new machine: Ubuntu, latest, arm64, name `devbox-<project>`, **Isolate machine**, **Network Isolation**.
- Open its shell, run the install command above.
- Reconnect later with `ssh devbox-<project>@orb`, then `cd ~/<project>` (the clone folder is named after the repo).

Plain SSH or any other Linux host works too — the install steps are identical.

## ✅ What you get

All the shared devbox defaults — git safety hooks, agent guardrails, Socket Firewall + `ignore-scripts`, `~/AGENTS.md` conventions, GitHub MCP, bundled skills, core toolchain, `agent-browser` / Vite+, Doppler/Infisical — come from [`@devbox/core`](../core) and are listed in the [root README](../../README.md). On top of those, this installer adds:

| ✨                         | 📦                                                                              |
| -------------------------- | -------------------------------------------------------------------------------- |
| **Fresh Ubuntu bootstrap** | starts from a clean Ubuntu host and sets up the devbox in one interactive flow  |
| **GitHub tooling**         | `gh` CLI with a guided repo-scoped fine-grained PAT minting flow                |
| **Agent CLIs**             | Claude Code (optional), plus the `claude login` OAuth hand-off                  |
| **Host wiring**            | tokens mirrored to `/etc/environment` for non-interactive SSH, `~/DEVBOX.md` guide, auto-cd into the clone |

## 🛠️ From source

From the monorepo root:

```bash
bun install
bun packages/ubuntu/src/cli.ts
```

Non-interactive runs (used by the smoke tests) take every prompt answer from a JSON file: `bun packages/ubuntu/src/cli.ts --scenario tests/smoke/scenarios/s1-minimal.json`.

## ⚠️ Known gaps

See the **Known gaps** section of the [root README](../../README.md) — the gaps (Socket Firewall scope, `ignore-scripts` escapes) are shared across both flavors.
