# Portability

- Cross-platform (macOS + Linux): use the portable BSD/GNU subset.
- Where BSD/GNU differ, branch explicitly.
- No absolute user paths in anything written — use `~`/`$HOME` or derive from the script's own location.
- No `grep -P` (BSD grep lacks it; blocked on macOS by permission-gate PB1) and no single-quoted `python3 -c` with embedded quotes — use `rg`, or a heredoc script for inline Python.
