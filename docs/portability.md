# Portability

- Cross-platform target is macOS+Linux: portable BSD/GNU subset only.
- BSD/GNU differ → branch explicitly.
- No absolute user paths in written output — `~`/`$HOME`, or derive from the script location.
- No `grep -P` (BSD lacks it). No single-quoted `python3 -c` with embedded quotes — use `rg` or a heredoc.
- No hardcoded `/bin/sh`: probe it (`process.platform !== 'win32' && existsSync('/bin/sh')`) and fall back to `PATH` resolution — see `skills/pidoc/scripts/pidoc.mjs`. Windows is out of the supported matrix, but the health check and Node scripts must degrade, never crash.
- `scripts/bootstrap.sh` and `scripts/after-pull.sh` are POSIX `sh`; `pidx` is OS-agnostic Rust (std + mtime, no watchers). The pidx store is explicit little-endian, so macOS and Linux share one path/format.
