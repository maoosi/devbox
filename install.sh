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

if [ -n "${DEVBOX_LOCAL_SRC:-}" ]; then
  # Smoke-test path: copy from a local checkout instead of fetching from GitHub.
  # The Dockerfile mounts the repo at /srv/devbox; this lets the harness
  # exercise install.sh end-to-end (umask, bun bootstrap, cli invocation)
  # without needing a published commit.
  step "copying devbox cli from ${DEVBOX_LOCAL_SRC}"
  cp -r "${DEVBOX_LOCAL_SRC}/package.json" "${DEVBOX_LOCAL_SRC}/tsconfig.json" "${DEVBOX_LOCAL_SRC}/src" "${DEVBOX_LOCAL_SRC}/templates" .
else
  # Fetch the whole repo as a tarball and selectively extract. The previous
  # approach (a hand-maintained list of curl calls) silently broke whenever
  # a new src/*.ts file was added without updating the list. The tarball glob
  # auto-discovers everything under src/ and templates/, eliminating drift.
  #
  # DEVBOX_TARBALL_URL override exists so the smoke harness can point at a
  # locally-built tarball (file:// or http://) and exercise this exact code
  # path without needing a pushed commit on GitHub.
  TARBALL_URL="${DEVBOX_TARBALL_URL:-https://codeload.github.com/${REPO}/tar.gz/${BRANCH}}"
  step "fetching devbox cli"
  curl -fsSL "$TARBALL_URL" \
    | tar -xz --strip-components=1 --wildcards \
        '*/package.json' '*/tsconfig.json' '*/src/*' '*/templates/*'
fi

step "installing dependencies"
bun install --silent

# Re-attach stdin to the TTY so interactive prompts work under `curl | bash`,
# where stdin would otherwise be the curl pipe. Skip when there is no TTY
# (smoke tests run in Docker without `-t`; --scenario supplies all answers).
if [ -e /dev/tty ] && [ -z "${DEVBOX_NO_TTY:-}" ]; then
  exec bun src/cli.ts "$@" < /dev/tty
else
  exec bun src/cli.ts "$@"
fi
