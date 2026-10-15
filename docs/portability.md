# Portability

- Cross-platform macOS+Linux: portable BSD/GNU subset.
- BSD/GNU differ → branch explicitly.
- No absolute user paths in written output — `~`/`$HOME` or derive from script location.
- No `grep -P` (BSD lacks; permission-gate PB1) ; no single-quoted `python3 -c` with embedded quotes — use `rg` or heredoc.
- `scripts/bootstrap.sh` is POSIX `sh` (macOS + Linux); `pidx` is OS-agnostic Rust (std + mtime, no watchers) — both first-class on Linux clones. The post-pull hook (`scripts/after-pull.sh`, POSIX `sh`) and the pidx store (explicit little-endian) keep macOS and Linux on the same path/format.
