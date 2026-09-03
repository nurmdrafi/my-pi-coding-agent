#!/usr/bin/env bash
# A/B one prompt across two pi configurations (same model, fresh sessions).
# Usage: bash ab_prefix.sh "<prompt>" <test_home> [model]
#   config A = real $HOME; config B = test_home (built by make_test_home.sh)
# Prints first-turn prompt tokens, cache-read tokens, total cost, wall time.
set -euo pipefail

[ $# -ge 2 ] || { echo 'usage: ab_prefix.sh "<prompt>" <test_home> [model]' >&2; exit 2; }
PROMPT="$1"; TEST_HOME="$2"; MODEL="${3:-glm-5.3}"
OUT=$(mktemp -d)

run() { # label home
  local label="$1" home="$2" t0 t1
  t0=$(date +%s.%N)
  if [ "$home" = "-" ]; then
    pi --provider zai --model "$MODEL" --mode json --no-session -p "$PROMPT" > "$OUT/$label.jsonl" 2>&1
  else
    env HOME="$home" pi --provider zai --model "$MODEL" --mode json --no-session -p "$PROMPT" > "$OUT/$label.jsonl" 2>&1
  fi
  t1=$(date +%s.%N)
  python3 - "$OUT/$label.jsonl" "$label" "$t0" "$t1" <<'PY'
import json, sys
path, label, t0, t1 = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
turns = usage = None
for line in open(path):
    if line.startswith("{") and '"turn_end"' in line:
        rec = json.loads(line)
        u = rec.get("message", {}).get("usage") or {}
        if usage is None:
            usage = u
        turns = (turns or 0) + 1
first = None if usage is None else usage.get("input", 0) + usage.get("cacheRead", 0) + usage.get("cacheWrite", 0)
cr = None if usage is None else usage.get("cacheRead", 0)
cost = None if usage is None else (usage.get("cost") or {}).get("total")
print(f"{label}: first_turn_prompt={first} cache_read={cr} turns={turns} cost=${cost} wall={t1-t0:.1f}s")
PY
}

run A_real "-"
run B_test "$TEST_HOME"
echo "raw: $OUT"
