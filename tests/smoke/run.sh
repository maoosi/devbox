#!/bin/bash
# Run every smoke scenario sequentially. Build image once up front; each
# scenario reuses it. Report pass/fail per scenario and exit non-zero if any
# scenario failed.
#
# Usage: run.sh
#        (or: bun run test:smoke)

set -uo pipefail

SMOKE_DIR="$(cd "$(dirname "$0")" && pwd)"

# Pre-build the image once so per-scenario timing isn't skewed by the build.
IMAGE="devbox-smoke:latest"
echo ">>> building $IMAGE"
docker build -q -t "$IMAGE" -f "$SMOKE_DIR/Dockerfile" "$SMOKE_DIR" >/dev/null

declare -a PASSED FAILED
for sf in "$SMOKE_DIR"/scenarios/*.json; do
  id=$(basename "$sf" .json)
  echo
  echo "════════════════════════════════════════════"
  echo "  scenario: $id"
  echo "════════════════════════════════════════════"
  if "$SMOKE_DIR/run-scenario.sh" "$id"; then
    PASSED+=("$id")
  else
    FAILED+=("$id")
  fi
done

echo
echo "════════════════════════════════════════════"
echo "  summary"
echo "════════════════════════════════════════════"
printf "  passed: %d\n" "${#PASSED[@]}"
for s in "${PASSED[@]+"${PASSED[@]}"}"; do printf "    ✓ %s\n" "$s"; done
printf "  failed: %d\n" "${#FAILED[@]}"
for s in "${FAILED[@]+"${FAILED[@]}"}"; do printf "    ✗ %s\n" "$s"; done

[ "${#FAILED[@]}" -eq 0 ] || exit 1
