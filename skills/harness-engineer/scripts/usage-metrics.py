#!/usr/bin/env python3
"""Usage metrics from pi session logs: per-model token profile, cost tail, prefix trend.
Run: python3 skills/harness-engineer/scripts/usage-metrics.py [--sessions N]"""
import json, glob, os, sys
from collections import defaultdict
from pathlib import Path

N = int(sys.argv[sys.argv.index("--sessions") + 1]) if "--sessions" in sys.argv else 8
files = glob.glob(str(Path.home() / ".pi/agent/sessions/*/*.jsonl"))

models = defaultdict(lambda: dict(t=0, i=0, o=0, r=0, cr=0, c=0.0))
sessions = []  # (ts, turns, cost)
prefix = []    # (ts, first_total_tokens)

for f in files:
    ts = os.path.basename(f)[:16].replace("T", " ")
    turns = cost = 0
    first = None
    for line in open(f):
        try: e = json.loads(line)
        except ValueError: continue
        m = e.get("message", {})
        u = m.get("usage")
        if m.get("role") != "assistant" or not u: continue
        k = m.get("model") or "?"
        p = models[k]
        p["t"] += 1; p["i"] += u.get("input", 0); p["o"] += u.get("output", 0)
        p["r"] += u.get("reasoning", 0); p["cr"] += u.get("cacheRead", 0)
        p["c"] += u.get("cost", {}).get("total", 0)
        if first is None: first = u.get("totalTokens", 0)
        cost += u.get("cost", {}).get("total", 0); turns += 1
    if turns:
        sessions.append((ts, turns, round(cost, 2)))
        prefix.append((ts, first))

print(f"{'model':26}{'turns':>6}{'in/t':>7}{'out/t':>7}{'rsn/t':>7}{'cache%':>7}{'cost$':>8}")
for k, v in sorted(models.items(), key=lambda x: -x[1]["c"]):
    t = v["t"] or 1
    print(f"{k[:26]:26}{v['t']:>6}{v['i']//t:>7}{v['o']//t:>7}{v['r']//t:>7}"
          f"{v['cr']/max(v['i']+v['cr'],1)*100:>6.0f}%{v['c']:>8.2f}")

print(f"\nTop expensive sessions (the cost tail):")
for ts, t, c in sorted(sessions, key=lambda x: -x[2])[:5]:
    print(f"  {ts}  {t:>4} turns  ${c}")

print(f"\nFirst-turn prompt size (prefix trend, last {N}):")
for ts, ft in sorted(prefix)[-N:]:
    print(f"  {ts}  {ft:>6} tok")
print("\nFlags: reasoning/output > 0.5 -> consider non-reasoning model;"
      " sessions > 200 turns -> prefer compaction/new session.")
