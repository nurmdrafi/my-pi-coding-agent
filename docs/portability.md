# Portability

- Cross-platform (macOS + Linux): use the portable BSD/GNU subset.
- Where BSD/GNU differ, branch explicitly.
- No absolute user paths in anything written — use `~`/`$HOME` or derive from the script's own location.
