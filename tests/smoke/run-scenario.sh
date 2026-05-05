#!/bin/bash
# Run one smoke scenario inside a fresh Ubuntu container:
#   1. Run install.sh (fresh install) using the local source via DEVBOX_LOCAL_SRC.
#   2. Run fresh-install assertions.
#   3. Snapshot generated state.
#   4. Run install.sh again (rerun over existing state).
#   5. Run rerun assertions (no-op idempotency, "Reusing token" log line).
#
# Usage: run-scenario.sh <scenario-id>
#        e.g. run-scenario.sh s2-doppler

set -euo pipefail

SCENARIO_ID="${1:-}"
[ -n "$SCENARIO_ID" ] || { echo "usage: $0 <scenario-id>" >&2; exit 2; }

SMOKE_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SMOKE_DIR/../.." && pwd)"
SCENARIO_FILE="$SMOKE_DIR/scenarios/${SCENARIO_ID}.json"

[ -f "$SCENARIO_FILE" ] || { echo "no such scenario: $SCENARIO_FILE" >&2; exit 2; }

IMAGE="devbox-smoke:latest"

echo ">>> building $IMAGE (cached on first build)"
docker build -q -t "$IMAGE" -f "$SMOKE_DIR/Dockerfile" "$SMOKE_DIR" >/dev/null

echo ">>> running scenario: $SCENARIO_ID"
docker run --rm \
  -v "$REPO_DIR:/srv/devbox:ro" \
  -v "$SMOKE_DIR:/srv/smoke:ro" \
  -e DEVBOX_LOCAL_SRC=/srv/devbox \
  -e DEVBOX_SKIP_TOKENS=1 \
  -e DEVBOX_NO_TTY=1 \
  -e SCENARIO_ID="$SCENARIO_ID" \
  "$IMAGE" \
  bash -c '
    set -euo pipefail

    cp "/srv/smoke/scenarios/${SCENARIO_ID}.json" /tmp/scenario.json
    cp /srv/smoke/assertions.sh /tmp/assertions.sh
    chmod +x /tmp/assertions.sh

    # Pull in PATH/exports written to ~/.bashrc.d/devbox.sh after install.
    # Sourcing ~/.bashrc is unreliable (most distros short-circuit it for
    # non-interactive shells) so we source devbox.sh directly.
    load_env() {
      [ -f "$HOME/.bashrc.d/devbox.sh" ] && source "$HOME/.bashrc.d/devbox.sh" || true
    }

    echo "════════ fresh install ════════"
    bash /srv/devbox/install.sh --scenario /tmp/scenario.json 2>&1 | tee /tmp/devbox-fresh.log

    load_env
    echo "════════ assertions: fresh ════════"
    /tmp/assertions.sh "$SCENARIO_ID" fresh /tmp/scenario.json

    echo "════════ snapshot ════════"
    # tar will warn on missing files; --ignore-failed-read tolerates that.
    tar --create --file /tmp/devbox-snapshot.tar --ignore-failed-read \
      "$HOME/.config" "$HOME/.claude" "$HOME/.bashrc" "$HOME/.bashrc.d" \
      "$HOME/AGENTS.md" /etc/apt/sources.list.d 2>/dev/null || true
    [ -f "$HOME/.bunfig.toml" ] && tar --append --file /tmp/devbox-snapshot.tar "$HOME/.bunfig.toml" 2>/dev/null || true

    echo "════════ rerun install ════════"
    bash /srv/devbox/install.sh --scenario /tmp/scenario.json 2>&1 | tee /tmp/devbox-rerun.log

    load_env
    echo "════════ assertions: rerun ════════"
    /tmp/assertions.sh "$SCENARIO_ID" rerun /tmp/scenario.json
  '

echo ">>> $SCENARIO_ID PASSED"
