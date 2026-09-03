#!/usr/bin/env python3
"""Audit pi session JSONL tool calls against AGENTS.md Token Economy rules.

Usage:
  python3 audit_toolcall_rules.py <path>    # session .jsonl file OR directory of .jsonl
                                          # default: ~/.pi/agent/sessions/*/*.jsonl (last 5)

Rules checked:
  R1 search-with-rg:   no `grep <filepath>` outside pipes
  R2 read-for-viewing: no cat/head/tail/sed -n on file paths outside pipes
  R3 no-re-runs:       no duplicate / python-vs-python3 near-duplicate bash commands
  R4 no-speculative:   no git status / --stat previews
  R5 no-pollution:     no ls -R / find -exec / full git log
  R6 batching stats:   calls per turn distribution + `&&` batching count
"""

import glob
import json
import os
import re
import sys
from collections import Counter

PIPE_SAFE = re.compile(r"\|\s*(rg|grep|wc|head|tail|sort|uniq|cut|awk|tr|jq)\b")


def check_grep_file(cmd):
    for seg in re.split(r"\||&&|;", cmd):
        s = seg.strip()
        if s.startswith("grep") or re.search(r"(^|&&|;| )grep ", s):
            if not (PIPE_SAFE.search(seg) or s.startswith("rg ")):
                toks = s.split()
                for i, t in enumerate(toks):
                    if t == "grep":
                        for u in toks[i + 1:]:
                            if not u.startswith("-") and u != "grep":
                                return True
    return False


def check_cat_file(cmd):
    for seg in re.split(r"\||&&|;", cmd):
        s = seg.strip()
        m = re.match(r"^(cat|head|tail)\s+([^|]*)", s) or re.match(r"^sed\s+-n\s+[^|]*\s+([^|]*)", s)
        if m:
            toks = (m.group(2) or "").split()
            while toks and toks[0].startswith("-"):
                toks.pop(0)
                if toks and toks[0].isdigit():
                    toks.pop(0)
            if toks:
                return True
    return False


def norm_cmd(cmd):
    return re.sub(r"\s+", " ", cmd.strip()).replace("python3 ", "python ")


def analyze(path):
    calls, turn = [], 0
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.strip().startswith("{"):
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = rec.get("type")
            if t == "turn_start":
                turn += 1
            elif t == "tool_execution_start":
                calls.append((turn, rec.get("toolName"), rec.get("args") or {}))

    bash_cmds = [a.get("command", "") for _, tl, a in calls if tl == "bash"]
    per_turn = Counter(t for t, tl, _ in calls if tl == "bash")

    v = Counter()
    seen, norm_seen = set(), set()
    for cmd in bash_cmds:
        c = cmd.strip()
        if check_grep_file(c) and not check_cat_file(c):
            v["R1_grep_file"] += 1
        if check_cat_file(c):
            v["R2_cat_file"] += 1
        key, nkey = re.sub(r"\s+", " ", c), norm_cmd(c)
        if key in seen:
            v["R3_rerun"] += 1
        elif nkey in norm_seen:
            v["R3_near_rerun"] += 1
        seen.add(key)
        norm_seen.add(nkey)
        if re.search(r"git status|--stat\b", c):
            v["R4_speculative"] += 1
        if re.search(r"\bls\s+-R\b|find\s+.*-exec|git log(?! --oneline)", c):
            v["R5_pollution"] += 1

    return {
        "file": os.path.basename(path),
        "tool_calls": len(calls),
        "bash": len(bash_cmds),
        "calls_per_toolturn": sorted(per_turn.values()),
        "batched_and": sum(1 for c in bash_cmds if "&&" in c),
        "violations": dict(v),
    }


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    if arg and os.path.isfile(arg):
        files = [arg]
    elif arg and os.path.isdir(arg):
        files = sorted(glob.glob(os.path.join(arg, "**", "*.jsonl"), recursive=True))
    else:
        files = sorted(glob.glob(os.path.expanduser("~/.pi/agent/sessions/*/*.jsonl")))[-5:]

    tot = Counter()
    for p in files:
        try:
            r = analyze(p)
        except (OSError, UnicodeDecodeError) as e:
            print(f"{p}: skipped ({e})")
            continue
        tot.update(r["violations"])
        nv = sum(r["violations"].values())
        flag = "OK " if nv == 0 else "V!"
        print(f"{flag} {r['file'][:44]:44} calls={r['tool_calls']:>3} bash={r['bash']:>3} "
              f"per-turn={str(r['calls_per_toolturn'])[:24]:24} &&={r['batched_and']:>2} viol={nv} {r['violations']}")
    print(f"\ntotals over {len(files)} file(s): {dict(tot)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
