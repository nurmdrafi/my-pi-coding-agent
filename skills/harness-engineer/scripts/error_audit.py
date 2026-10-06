#!/usr/bin/env python3
"""Summarize tool errors across pi session transcripts.

Usage:
  python3 error_audit.py [path]   # .jsonl file OR directory (recursive)
                                 # default: ~/.pi/agent/sessions

Transcript format: tool results are `message` records with role "toolResult"
and isError:true; the originating input is joined via toolCallId back to the
assistant content item {"type":"toolCall","id":...,"arguments":{...}}.
"""

import glob
import json
import os
import re
import sys
from collections import Counter

EXIT_RE = re.compile(r"Command exited with code (\d+)")


def _kind(text):
    m = EXIT_RE.search(text)
    if m:
        return "exit %s" % m.group(1)
    low = text.lower()
    if "could not find edits" in low or "oldtext" in low:
        return "edit anchor"
    if "does not exist" in low or "no such file" in low or "not found" in low:
        return "not found"
    if "enoent" in low or "eacces" in low or "eperm" in low:
        return "fs error"
    lines = [l for l in text.splitlines() if l.strip()]
    return lines[0].strip()[:40] if lines else "?"


def _first_cmd(inp):
    if not isinstance(inp, dict):
        return ""
    raw = inp.get("command") or inp.get("path") or ""
    return str(raw).strip().splitlines()[0] if str(raw).strip() else ""


def _head_cmd(inp):
    """Rank key: leading token of the command ('wc', 'npm', ...) or tool name."""
    c = _first_cmd(inp)
    return c.split()[0] if c else ""


def iter_sessions(paths):
    for p in paths:
        proj = os.path.basename(os.path.dirname(p))
        calls = {}
        with open(p, encoding="utf-8") as f:
            for line in f:
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                msg = e.get("message")
                if not isinstance(msg, dict):
                    continue
                role = msg.get("role")
                if role == "assistant":
                    for item in msg.get("content") or []:
                        if isinstance(item, dict) and item.get("type") == "toolCall":
                            calls[item.get("id")] = item.get("arguments") or {}
                elif role == "toolResult" and msg.get("isError"):
                    text = "".join(
                        c.get("text", "") for c in msg.get("content") or [] if isinstance(c, dict)
                    )
                    yield (
                        e.get("timestamp", ""),
                        proj,
                        msg.get("toolName", "?"),
                        calls.get(msg.get("toolCallId")) or {},
                        text,
                    )


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.pi/agent/sessions")
    if os.path.isdir(root):
        paths = sorted(glob.glob(os.path.join(root, "**", "*.jsonl"), recursive=True))
    else:
        paths = [root]
    errors = list(iter_sessions(paths))

    if not errors:
        print("no tool errors found")
        return 0

    by_tool = Counter(p[2] for p in errors)
    by_proj = Counter(p[1] for p in errors)
    by_kind = Counter(_kind(p[4]) for p in errors)
    by_head = Counter(h for h in (_head_cmd(p[3]) for p in errors) if h)

    print("tool errors: %d across %d file(s)" % (len(errors), len(paths)))
    print("\nby tool:   ", ", ".join("%s=%d" % kv for kv in by_tool.most_common()))
    print("by kind:   ", ", ".join("%s=%d" % kv for kv in by_kind.most_common(8)))
    print("by project:")
    for proj, n in by_proj.most_common(8):
        print("  %-40s %d" % (proj[:40], n))
    if by_head:
        print("top failing command heads:")
        for head, n in by_head.most_common(10):
            print("  %-16s %d" % (head[:16], n))
    print("\nmost recent:")
    for ts, proj, tool, inp, text in errors[-10:]:
        cmd = _first_cmd(inp)[:100]
        print("  %s %s %s %s" % (str(ts)[:19], tool, cmd, "=> " + _kind(text)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
