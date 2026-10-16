# Portability

- Cross-platform target is macOS+Linux: portable BSD/GNU subset only.
- BSD/GNU differ → branch explicitly.
- No absolute user paths in written output — `~`/`$HOME`, or derive from the script location.
- No `grep -P` (BSD lacks it; permission-gate PB1). No single-quoted `python3 -c` with embedded quotes — use `rg` or a heredoc.
- `scripts/bootstrap.sh` is POSIX `sh` (macOS + Linux); `pidx` is OS-agnostic Rust (std + mtime, no watchers). Both are first-class on Linux clones. The post-pull hook (`scripts/after-pull.sh`, POSIX `sh`) and the pidx store (explicit little-endian) keep macOS and Linux on the same path/format.
