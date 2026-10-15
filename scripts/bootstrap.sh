#!/bin/sh
# pi harness bootstrap — fresh clone → working setup (macOS + Linux).
#
# Usage: sh scripts/bootstrap.sh          (from repo root or anywhere)
#
# Does:  npm deps + pi package links, pidoc shim into bin/, pidx + piread
#        builds when cargo exists. Never installs anything itself — prints the exact
#        commands and exits when a toolchain is missing (ask-first rule).
# After this, `git pull` re-syncs via .husky/post-merge → scripts/after-pull.sh.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

echo "== bootstrap: $ROOT"

# 1. node deps + pi package links (extensions resolve the host install)
if command -v npm >/dev/null 2>&1; then
  npm install --no-audit --no-fund
  node scripts/link-pi.mjs
else
  echo "!! npm not found — install Node (nvm recommended), then re-run" >&2
  exit 1
fi

# 2. bin/ is machine-local (gitignored): create it + the pidoc shim
mkdir -p bin
cat > bin/pidoc <<EOF
#!/bin/sh
exec node "$ROOT/skills/pidoc/scripts/pidoc.mjs" "\$@"
EOF
chmod +x bin/pidoc
echo "== pidoc shim: bin/pidoc"

# 3. pidx (optional — session-audit fast path; Node fallback without it)
CARGO=$(command -v cargo || true)
[ -z "$CARGO" ] && [ -x "$HOME/.cargo/bin/cargo" ] && CARGO="$HOME/.cargo/bin/cargo"
if [ -n "$CARGO" ]; then
  (cd native/pidx && "$CARGO" build --release)
  cp native/pidx/target/release/pidx bin/pidx
  echo "== pidx: built + installed to bin/pidx"
else
  echo "== pidx: cargo not found — session-audit uses the Node parser (slower)." \
       "To enable: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal && re-run"
fi

# 4. piread (native read tool, default-on — PI_NATIVE_READ=0 opts out;
#    the extension falls back to the built-in read without the binary)
if [ -n "$CARGO" ]; then
  (cd native/piread && "$CARGO" build --release)
  cp native/piread/target/release/piread bin/piread
  echo "== piread: built + installed to bin/piread"
else
  echo "== piread: cargo not found — the read tool stays on its built-in implementation." \
       "To enable: install Rust (rustup command above) and re-run"
fi

# 5. health check
node skills/pidoc/scripts/pidoc.mjs || true
echo "== done. Put $ROOT/bin on PATH for pidoc/pidx."
