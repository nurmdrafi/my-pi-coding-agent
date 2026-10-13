# Portability

- Cross-platform macOS+Linux: portable BSD/GNU subset.
- BSD/GNU differ → branch explicitly.
- No absolute user paths in written output — `~`/`$HOME` or derive from script location.
- No `grep -P` (BSD lacks; permission-gate PB1) ; no single-quoted `python3 -c` with embedded quotes — use `rg` or heredoc.
