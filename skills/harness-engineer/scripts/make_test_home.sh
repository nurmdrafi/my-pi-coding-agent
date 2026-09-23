#!/usr/bin/env bash
# Build a temporary pi test HOME with selected skills model-visible.
# Usage: bash make_test_home.sh <skill1,skill2,...> [dest]
#   e.g.: bash make_test_home.sh tavily-search,systematic-debugging
# Leaves AGENTS.md/settings/auth in place; strips disable-model-invocation from
# the listed skills only. Does NOT touch the real ~/.pi/agent.
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: $0 <skill1,skill2,...> [dest]" >&2; exit 2; }
IFS=',' read -ra SKILLS <<< "$1"
DEST="${2:-/tmp/pi-test-home}"
AGENT_DIR="$HOME/.pi/agent"
DEST_AGENT="$DEST/.pi/agent"

rm -rf "$DEST"
mkdir -p "$DEST_AGENT/skills"

cp "$AGENT_DIR/AGENTS.md" "$AGENT_DIR/auth.json" "$AGENT_DIR/settings.json" \
   "$AGENT_DIR/models.json" "$DEST_AGENT/"
[ -f "$AGENT_DIR/models-store.json" ] && cp "$AGENT_DIR/models-store.json" "$DEST_AGENT/"

for s in "${SKILLS[@]}"; do
  [ -d "$AGENT_DIR/skills/$s" ] || { echo "unknown skill: $s" >&2; exit 1; }
  cp -r "$AGENT_DIR/skills/$s" "$DEST_AGENT/skills/$s"
  # portable in-place strip (bare `sed -i` breaks on BSD/macOS sed)
  perl -ni -e 'print unless /^disable-model-invocation:/' "$DEST_AGENT/skills/$s/SKILL.md"
done

[ -d "$AGENT_DIR/tavily" ] && ln -sfn "$AGENT_DIR/tavily" "$DEST/.tavly"

echo "test home ready: $DEST (skills: ${SKILLS[*]})"
