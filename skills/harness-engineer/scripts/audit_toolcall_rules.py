#!/usr/bin/env python3
"""Audit pi session JSONL tool calls against AGENTS.md Token Economy rules.

Usage:
  python3 audit_toolcall_rules.py <path>    # session .jsonl file OR directory of .jsonl
                                          # default: ~/.pi/agent/sessions/*/*.jsonl (last 5)

Rules checked (aligned with current AGENTS.md Token-Economy):
  R1 search-with-rg:   no `grep <filepath>` outside pipes
  R2 read-for-viewing: no cat/head/tail on file paths outside pipes
                       (windowed `sed -n A,Bp` is now allowed for batching)
  R3 no-re-runs:       no exact / normalized near-duplicate bash commands
  R4 no-speculative:   no git status / --stat previews
  R5 no-pollution:     no ls -R / find -exec / full git log (without --oneline|head)
  R6 minified-cap:     rg into dist/*.min.js without -o or a cut/head pipe
  R7 batching stats:   calls per turn distribution + `&&` batching count

Log format: tool calls live in assistant `message` records as content items
of type "toolCall" (name + arguments.command) — not tool_execution_start.
"""

import glob
import json
import os
import re
import sys
from collections import Counter

def _statements(cmd):
    """Split into statements; treat $(...) and `...` contents as their own
    statements so command substitution is analyzed independently."""
    c = re.sub(r"\$\(", "; ", cmd)
    c = c.replace("`", "; ")
    return [s for s in re.split(r"&&|;", c) if s.strip()]


def check_grep_file(cmd):
    # Only stage 0 of a pipe can read a file; downstream grep reads stdin
    # (pipe filtering is allowed by AGENTS.md).
    for stmt in _statements(cmd):
        stages = [s.strip() for s in stmt.split("|")]
        if not stages:
            continue
        s0 = re.match(r"^(?:env\s+)?(?:\w+=\S+\s+)*grep\b", stages[0])
        if not s0:
            continue
        toks = stages[0].split()
        i = 1
        while i < len(toks) and toks[i].startswith("-"):
            i += 1
        # non-flag args: pattern + (file...) -> flag only when a file arg exists
        if len(toks) - i >= 2:
            return True
    return False


def check_cat_file(cmd):
    for seg in re.split(r"\||&&|;", cmd):
        s = seg.strip()
        m = re.match(r"^(cat|head|tail)\s+([^|]*)", s)
        if m:
            toks = m.group(2).split()
            while toks and toks[0].startswith("-"):
                toks.pop(0)
            if toks:
                return True
    return False


def check_minified_uncapped(cmd):
    # rg into dist/minified paths without -o or piping through cut/head
    if not re.search(r"\b(rg|ripgrep)\b", cmd):
        return False
    if not re.search(r"(dist|node_modules|\.min\.(js|css))", cmd):
        return False
    if "-o" in cmd or re.search(r"\|\s*(cut|head)\b", cmd):
        return False
    return True


def norm_cmd(cmd):
    return re.sub(r"\s+", " ", cmd.strip()).replace("python3 ", "python ")


def extract_calls(path):
    """Extract (turn, tool_name, args) from session JSONL.

    Tool calls are content items with type "toolCall" inside assistant
    `message` records: {"type":"toolCall","name":...,"arguments":{...}}.
    """
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
            elif t == "tool_execution_start":  # legacy format, if ever present
                calls.append((turn, rec.get("toolName"), rec.get("args") or {}))
            elif t == "message":
                msg = rec.get("message") or {}
                role = msg.get("role")
                if role == "user":
                    # user message = new turn boundary in this log format
                    turn += 1
                elif role == "assistant":
                    for item in msg.get("content") or []:
                        if isinstance(item, dict) and item.get("type") == "toolCall":
                            calls.append((turn, item.get("name"), item.get("arguments") or {}))
    return calls


def analyze(path):
    calls = extract_calls(path)

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
        if re.search(r"\bls\s+-R\b|find\s+.*-exec", c):
            v["R5_pollution"] += 1
        if re.search(r"git log\b(?!\s+--oneline)", c) and not re.search(r"\|\s*head\b", c):
            v["R5_git_log_full"] += 1
        if check_minified_uncapped(c):
            v["R6_minified_uncapped"] += 1

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
