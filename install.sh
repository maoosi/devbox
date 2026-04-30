#!/usr/bin/env bash
# devbox installer. Ensures Bun is available, fetches the CLI, and runs it.
set -euo pipefail
umask 077

REPO="${DEVBOX_REPO:-maoosi/devbox}"
BRANCH="${DEVBOX_BRANCH:-main}"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

step() { printf "→ %s\n" "$*"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Run as a regular user with sudo, not root." >&2
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  step "installing unzip (required by bun)"
  sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unzip
fi

if ! command -v bun >/dev/null 2>&1; then
  step "installing bun"
  curl -fsSL https://bun.sh/install | bash >/dev/null
fi
export PATH="$HOME/.bun/bin:$PATH"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

step "fetching devbox cli"
mkdir -p src/tools templates
curl -fsSL "${RAW}/package.json"  -o package.json
curl -fsSL "${RAW}/tsconfig.json" -o tsconfig.json
for f in cli.ts exec.ts env.ts dryrun.ts; do
  curl -fsSL "${RAW}/src/${f}" -o "src/${f}"
done
for f in index system runtimes claude github doppler infisical agent-browser socket vite-plus ignore-scripts mcp repo skills conventions; do
  curl -fsSL "${RAW}/src/tools/${f}.ts" -o "src/tools/${f}.ts"
done
# Skills shipped onto every devbox. Keep in sync with SHIPPED_SKILLS in src/tools/skills.ts.
for s in code-review; do
  mkdir -p "templates/skills/${s}"
  curl -fsSL "${RAW}/templates/skills/${s}/SKILL.md" -o "templates/skills/${s}/SKILL.md"
done

step "installing dependencies"
bun install --silent

# Re-attach stdin to the TTY so interactive prompts work under `curl | bash`,
# where stdin would otherwise be the curl pipe.
exec bun src/cli.ts "$@" < /dev/tty
