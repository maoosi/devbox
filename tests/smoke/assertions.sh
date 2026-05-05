#!/bin/bash
# Post-install + post-rerun assertions for a smoke scenario.
#
# Usage: assertions.sh <scenario-id> <phase> <scenario-json>
#   phase = "fresh" (after first install) or "rerun" (after second install)
#
# Reads scenario-json to know which optional/secrets-manager tools were installed
# and conditions assertions accordingly. Each failed assertion prints to stderr
# and increments FAILS; the script exits non-zero if anything failed.
#
# Run inside the Docker container as the `devbox` user. PATH must include the
# devbox-installed binaries (bun, gh, etc.) — caller sources ~/.bashrc first.

set -uo pipefail
SCENARIO_ID="${1:?missing scenario id}"
PHASE="${2:?missing phase (fresh|rerun)}"
SCENARIO_JSON="${3:?missing scenario JSON path}"

FAILS=0
fail() { printf "  ✗ %s\n" "$*" >&2; FAILS=$((FAILS+1)); }
ok()   { printf "  ✓ %s\n" "$*"; }

# jq isn't installed in the base image; system tool installs it. Use a tiny
# bash JSON probe instead so assertions don't depend on a tool the smoke run
# is itself supposed to install.
has_in_array() { grep -q "\"$1\"" <<<"$2"; }

SECRETS=$(grep -E '"secretsManager"' "$SCENARIO_JSON" | sed -E 's/.*"secretsManager"\s*:\s*"([^"]+)".*/\1/')
TOOLS_LINE=$(grep -E '"selectedToolIds"' "$SCENARIO_JSON")

echo "── assertions: $SCENARIO_ID / $PHASE ──"

# ── Required binaries on PATH ─────────────────────────────────────────────
for bin in gh bun node pnpm; do
  if command -v "$bin" >/dev/null 2>&1 && "$bin" --version >/dev/null 2>&1; then
    ok "$bin --version OK"
  else
    fail "$bin not on PATH or --version failed"
  fi
done

# ── Conditional binaries ──────────────────────────────────────────────────
case "$SECRETS" in
  doppler)
    command -v doppler >/dev/null 2>&1 && doppler --version >/dev/null 2>&1 \
      && ok "doppler --version OK" \
      || fail "doppler not on PATH (secretsManager=doppler)" ;;
  infisical)
    command -v infisical >/dev/null 2>&1 && infisical --version >/dev/null 2>&1 \
      && ok "infisical --version OK" \
      || fail "infisical not on PATH (secretsManager=infisical)" ;;
esac

if has_in_array "claude" "$TOOLS_LINE"; then
  command -v claude >/dev/null 2>&1 && claude --version >/dev/null 2>&1 \
    && ok "claude --version OK" \
    || fail "claude not on PATH (selected)"
fi

# ── Keyring perms (the umask 077 → 0600 → apt-get-100 class) ──────────────
shopt -s nullglob
keyring_failed=0
for k in /usr/share/keyrings/*.gpg; do
  mode=$(stat -c "%a" "$k")
  case "$mode" in
    644|664|666)
      ok "$(basename "$k") mode $mode (group/world readable)" ;;
    *)
      fail "$(basename "$k") mode $mode — _apt user can't read this; apt-get update will exit 100"
      keyring_failed=1 ;;
  esac
done
[ "$keyring_failed" -eq 0 ] || true
shopt -u nullglob

# ── Generated files ───────────────────────────────────────────────────────
ENV_FILE="$HOME/.config/devbox/env"
if [ -f "$ENV_FILE" ]; then
  mode=$(stat -c "%a" "$ENV_FILE")
  [ "$mode" = "600" ] && ok "$ENV_FILE mode 600" || fail "$ENV_FILE mode $mode (expected 600)"
else
  fail "$ENV_FILE missing"
fi

[ -f "$HOME/AGENTS.md" ] && ok "~/AGENTS.md exists" || fail "~/AGENTS.md missing"

if has_in_array "claude" "$TOOLS_LINE"; then
  [ -f "$HOME/.claude/CLAUDE.md" ] && ok "~/.claude/CLAUDE.md exists" || fail "~/.claude/CLAUDE.md missing (claude selected)"
fi

# ── ~/.bashrc devbox source line: present, exactly once ───────────────────
SRC_LINE='for f in ~/.bashrc.d/*.sh; do'
count=$(grep -c "$SRC_LINE" "$HOME/.bashrc" 2>/dev/null || echo 0)
case "$count" in
  1) ok "~/.bashrc devbox source line present once" ;;
  0) fail "~/.bashrc missing devbox source line" ;;
  *) fail "~/.bashrc has devbox source line $count times (expected 1)" ;;
esac

# ── Re-run-only checks ────────────────────────────────────────────────────
if [ "$PHASE" = "rerun" ]; then
  case "$SECRETS" in
    doppler)
      grep -q "Reusing existing Doppler token" /tmp/devbox-rerun.log \
        && ok "rerun reused Doppler token" \
        || fail "rerun did not reuse Doppler token (re-prompted instead)" ;;
    infisical)
      grep -q "Reusing existing Infisical token" /tmp/devbox-rerun.log \
        && ok "rerun reused Infisical token" \
        || fail "rerun did not reuse Infisical token (re-prompted instead)" ;;
  esac

  if [ -f /tmp/devbox-snapshot.tar ]; then
    cd /
    if tar --diff -f /tmp/devbox-snapshot.tar 2>&1 \
        | grep -vE 'Mod time differs|/tmp/devbox-(fresh|rerun)\.log' \
        | grep -E '.+'; then
      fail "rerun mutated tracked files (see diff above)"
    else
      ok "rerun left tracked files unchanged (idempotent)"
    fi
  fi
fi

echo "── $FAILS failure(s) in $SCENARIO_ID / $PHASE ──"
exit "$FAILS"
