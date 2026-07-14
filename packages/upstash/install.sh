#!/usr/bin/env bash
# devbox installer — persistent install to ~/.devbox, no npm publish needed.
#
#   curl -fsSL https://raw.githubusercontent.com/maoosi/devbox/main/packages/upstash/install.sh | bash
#
# Re-run to update. Overrides: DEVBOX_REPO, DEVBOX_BRANCH, DEVBOX_HOME.
# DEVBOX_LOCAL_SRC=<dir> installs from a local monorepo checkout instead of GitHub (for testing).
set -euo pipefail
umask 077

REPO="${DEVBOX_REPO:-maoosi/devbox}"
BRANCH="${DEVBOX_BRANCH:-main}"
DEVBOX_HOME="${DEVBOX_HOME:-$HOME/.devbox}"

step() { printf "→ %s\n" "$*"; }
warn() { printf "! %s\n" "$*" >&2; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Run as a regular user, not root." >&2
  exit 1
fi

# Bun's installer needs unzip on Linux; macOS ships everything required.
if ! command -v unzip >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
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

if [ -n "${DEVBOX_LOCAL_SRC:-}" ]; then
  step "copying devbox from ${DEVBOX_LOCAL_SRC}"
  # No bun.lock here: the trimmed copy omits the @devbox/ubuntu workspace the
  # lockfile references. The GitHub path below ships the full repo + lock.
  cp "${DEVBOX_LOCAL_SRC}/package.json" "${DEVBOX_LOCAL_SRC}/bunfig.toml" \
    "${DEVBOX_LOCAL_SRC}/tsconfig.base.json" "$WORK/"
  mkdir -p "$WORK/packages"
  cp -R "${DEVBOX_LOCAL_SRC}/packages/core" "${DEVBOX_LOCAL_SRC}/packages/upstash" "$WORK/packages/"
else
  step "fetching devbox (${REPO}@${BRANCH})"
  # Extract everything with --strip-components=1 — portable across BSD/GNU tar.
  curl -fsSL "https://codeload.github.com/${REPO}/tar.gz/${BRANCH}" \
    | tar -xz -C "$WORK" --strip-components=1
fi

# The download fully succeeded before the old install is touched, so a failed
# fetch never breaks an existing install.
step "installing to ${DEVBOX_HOME}"
rm -rf "$DEVBOX_HOME"
mv "$WORK" "$DEVBOX_HOME"
trap - EXIT

cd "$DEVBOX_HOME"
step "installing dependencies"
bun install --silent

# Registers the `devbox` bin into ~/.bun/bin and makes `bun link @devbox/upstash`
# available inside projects that want editor types.
step "linking devbox CLI"
(cd packages/upstash && bun link >/dev/null)

RESOLVED="$(command -v devbox || true)"
if [ -z "$RESOLVED" ]; then
  warn "~/.bun/bin is not on your PATH. Add this to your shell profile:"
  warn "  export PATH=\"\$HOME/.bun/bin:\$PATH\""
elif [ "$RESOLVED" != "$HOME/.bun/bin/devbox" ]; then
  warn "'devbox' currently resolves to $RESOLVED — a shell alias or other binary"
  warn "may shadow the CLI at $HOME/.bun/bin/devbox."
fi

step "done — run 'devbox help' to get started (re-run this installer to update)"
