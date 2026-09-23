#!/usr/bin/env bash
# skillcheck — "was skill <name> actually loaded this session?"
# A skill is LOADED only when the agent issues a `read` tool call on its SKILL.md.
# Reads the live session JSONL directly (newest file in ~/.pi/agent/sessions).
# Portable: bash 3.2 (stock macOS) / Linux, coreutils only — no jq/node needed.
# Usage: skillcheck.sh [skill[,skill...]]   (default: check all known skills)
set -u

SKILLS=$(cd "$HOME/.pi/agent/skills" 2>/dev/null && ls -1)
[ $# -ge 1 ] && [ -n "$1" ] && SKILLS=$(printf '%s' "$1" | tr ',' ' ')

SESSIONS_DIR="${HOME}/.pi/agent/sessions"
if [ ! -d "$SESSIONS_DIR" ]; then
	echo "no sessions dir: $SESSIONS_DIR" >&2
	exit 1
fi

# ponytail: newest = `ls -t | head -1`; breaks only if xargs splits ls into
# multiple invocations (ARG_MAX — ~10k session files) or paths contain newlines.
LATEST=$(find "$SESSIONS_DIR" -type f -name '*.jsonl' -print0 |
	xargs -0 ls -t 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
	echo "no sessions found"
	exit 0
fi

echo "Session: ${LATEST##*/}"

# A real read = a line with BOTH "type":"toolCall" and "name":"read" (the
# system preamble / toolsAdded entries carry "name":"read" without toolCall).
# ponytail: assumes pi's compact JSON.stringify output (no spaces) and no
# JSON-escaped chars in skill paths — both hold for pi-written sessions.
CALLS=$(grep '"type":"toolCall"' "$LATEST" | grep '"name":"read"')

FOUND=0
for s in $SKILLS; do
	PATH_HIT=$(printf '%s\n' "$CALLS" |
		grep -o "\"path\":\"[^\"]*/$s/SKILL.md\"" | head -1 | cut -d'"' -f4)
	if [ -n "$PATH_HIT" ]; then
		printf '✓ %s  -> read %s\n' "$s" "$PATH_HIT"  # literal ✓ — bash 3.2 printf lacks \u
		FOUND=1
	fi
done

if [ "$FOUND" -eq 0 ]; then
	echo ""
	echo "No requested skill was loaded (no read of its SKILL.md)."
	echo "A skill loads ONLY via a read call on <skill>/SKILL.md."
	exit 1  # gate-usable: no confirmation = failure
fi
