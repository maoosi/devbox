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
  # Tokens are written by @devbox/core's upsertEnv as `export KEY='v'` lines.
  grep -q "^export GH_TOKEN=" "$ENV_FILE" \
    && ok "env file has export GH_TOKEN line" \
    || fail "env file missing export GH_TOKEN= line (format drift?)"
else
  fail "$ENV_FILE missing"
fi

[ -f "$HOME/AGENTS.md" ] && ok "~/AGENTS.md exists" || fail "~/AGENTS.md missing"

if has_in_array "claude" "$TOOLS_LINE"; then
  [ -f "$HOME/.claude/CLAUDE.md" ] && ok "~/.claude/CLAUDE.md exists" || fail "~/.claude/CLAUDE.md missing (claude selected)"
fi

# ── ~/.bunfig.toml (ignore-scripts is required tool) ──────────────────────
BUNFIG="$HOME/.bunfig.toml"
if [ -f "$BUNFIG" ] && grep -Fq "ignoreScripts = true" "$BUNFIG"; then
  ok "~/.bunfig.toml has ignoreScripts = true"
else
  fail "~/.bunfig.toml missing or doesn't set ignoreScripts = true"
fi

# ── Skills shipped (claude implies skills runs by default) ────────────────
if has_in_array "skills" "$TOOLS_LINE"; then
  SKILL="$HOME/.claude/skills/code-review/SKILL.md"
  [ -f "$SKILL" ] && ok "shipped skill code-review/SKILL.md exists" \
    || fail "$SKILL missing (skills tool selected)"
fi

# ── apt-get update succeeds (proves keyring perms work end-to-end) ────────
# Only run on fresh — rerun shouldn't repeat this network call. The keyring
# mode check above is a proxy; this is the real outcome that matters.
if [ "$PHASE" = "fresh" ]; then
  if sudo apt-get update -qq >/dev/null 2>&1; then
    ok "apt-get update succeeds (all keyrings readable by _apt)"
  else
    fail "apt-get update failed — likely a keyring or sources.list.d issue"
  fi
fi

# ── ~/.bashrc devbox source line: present, exactly once ───────────────────
# -F (fixed string) is required: the literal SRC_LINE contains "/*", which is a
# valid BRE regex but doesn't match itself (`/` followed by 0+-/ quantifier,
# then any char) — silently zero matches.
SRC_LINE='for f in ~/.bashrc.d/*.sh; do'
if [ -f "$HOME/.bashrc" ]; then
  count=$(grep -Fc "$SRC_LINE" "$HOME/.bashrc")
else
  count=0
fi
case "$count" in
  1) ok "~/.bashrc devbox source line present once" ;;
  0) fail "~/.bashrc missing devbox source line" ;;
  *) fail "~/.bashrc has devbox source line $count times (expected 1)" ;;
esac

# ── Auto-cd into clone dir on interactive shells ──────────────────────────
SLUG=$(grep -E '"repo"' "$SCENARIO_JSON" | sed -E 's|.*/([^/"]+)/?".*|\1|')
CD_LINE="[[ \$- == *i* ]] && [ -d ~/${SLUG} ] && cd ~/${SLUG}"
if grep -Fq "$CD_LINE" "$HOME/.bashrc.d/devbox.sh" 2>/dev/null; then
  ok "devbox.sh has auto-cd line for $SLUG"
else
  fail "devbox.sh missing auto-cd line for $SLUG"
fi

# Fresh interactive shell should land in ~/<slug>. Start from $HOME so we
# can observe the cd. `bash -ic` enables interactive flags ($- contains 'i').
pwd_out=$(cd "$HOME" && bash -ic 'pwd' 2>/dev/null | tail -n1)
if [ "$pwd_out" = "$HOME/$SLUG" ]; then
  ok "interactive shell auto-cd → \$HOME/$SLUG"
else
  fail "interactive shell pwd='$pwd_out' (expected \$HOME/$SLUG)"
fi

# Socket-firewall wrappers are shell functions in ~/.config/devbox/aliases.sh,
# sourced from ~/.bashrc — prove they load in a fresh interactive shell.
if has_in_array "socket" "$TOOLS_LINE"; then
  [ -f "$HOME/.config/devbox/aliases.sh" ] \
    && ok "~/.config/devbox/aliases.sh exists" \
    || fail "~/.config/devbox/aliases.sh missing (socket selected)"
  if bash -ic 'type npm' 2>/dev/null | grep -q "is a function"; then
    ok "npm wrapper function loads in fresh interactive shell"
  else
    fail "npm wrapper function not loaded in fresh interactive shell"
  fi
fi

# ── Re-run-only checks ────────────────────────────────────────────────────
if [ "$PHASE" = "rerun" ]; then
  # Token reuse shows up as the spinner's "↻ reused" stamp on the tool's
  # label line (with the REUSE_NOTE). Match label + "reused" on one line so
  # the summary's lowercase id list can't false-positive.
  case "$SECRETS" in
    doppler)
      grep -q "Doppler (one project, read-only).*reused" /tmp/devbox-rerun.log \
        && ok "rerun reused Doppler token" \
        || fail "rerun did not reuse Doppler token (re-prompted instead)" ;;
    infisical)
      grep -q "Infisical (one project, read-only).*reused" /tmp/devbox-rerun.log \
        && ok "rerun reused Infisical token" \
        || fail "rerun did not reuse Infisical token (re-prompted instead)" ;;
  esac

  # GH_TOKEN reuse — same readEnv() round-trip as the secrets managers.
  if grep -q "GitHub CLI + scoped token.*reused" /tmp/devbox-rerun.log; then
    ok "rerun reused GitHub token"
  else
    fail "rerun did not reuse GitHub token (re-prompted instead)"
  fi

  # ~/.bashrc byte-identical across fresh→rerun. This is the direct check for
  # the fnm/bun/pnpm-append-on-rerun risk: each runtime installer appends a
  # PATH block on every run, and runtimes.ts guards on marker-dir existence
  # to short-circuit. If any of those guards regresses, this check catches it.
  if [ -f /tmp/devbox-bashrc.sha256 ] && sha256sum -c /tmp/devbox-bashrc.sha256 >/dev/null 2>&1; then
    ok "~/.bashrc byte-identical after rerun"
  else
    fail "~/.bashrc changed across rerun (likely an installer appended duplicates)"
  fi

  # Skills idempotency: run-scenario.sh appended a marker line to the shipped
  # skill between fresh and rerun. After rerun the marker must still be there.
  SKILL="$HOME/.claude/skills/code-review/SKILL.md"
  if [ -f "$SKILL" ]; then
    if grep -q "devbox-smoke-marker" "$SKILL"; then
      ok "skills tool preserved user edit on rerun"
    else
      fail "skills tool clobbered user edit on rerun"
    fi
  fi

  # Tar diff over the rest of the managed tree. Mod-time-only diffs are
  # expected (atime/mtime touch on read-only access); anything else is real.
  if [ -f /tmp/devbox-snapshot.tar ]; then
    cd /
    diff_out=$(tar --diff -f /tmp/devbox-snapshot.tar 2>&1 \
      | grep -vE 'Mod time differs|/tmp/devbox-(fresh|rerun)\.log' || true)
    if [ -n "$diff_out" ]; then
      printf '%s\n' "$diff_out" >&2
      fail "rerun mutated tracked files (see diff above)"
    else
      ok "rerun left tracked files unchanged (idempotent)"
    fi
  fi
fi

echo "── $FAILS failure(s) in $SCENARIO_ID / $PHASE ──"
exit "$FAILS"
