#!/bin/sh
# after-pull.sh — keep the machine-local harness setup in sync after a pull.
# Invoked by .husky/post-merge and .husky/post-rewrite on macOS + Linux.
#
# Always runs the pidoc health check. Safe, non-privileged fixes apply
# automatically (npm deps + host links, pidoc shim, pidx rebuild). Missing
# toolchains (cargo/rg/gh/jq/fd) are reported with their fix command — installs
# are never run from here (ask-first rule). Always exits 0.
set -u

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$ROOT" || exit 0

echo "== after-pull: syncing setup ($(uname -s))"

# 1. Node deps + host pi package links. Fresh install only when the manifest
#    moved in this pull or node_modules is missing; link-pi self-validates.
if command -v npm >/dev/null 2>&1; then
  changed=0
  [ -d node_modules ] || changed=1
  if git rev-parse --verify -q ORIG_HEAD >/dev/null 2>&1 &&
     ! git diff --quiet ORIG_HEAD HEAD -- package.json package-lock.json 2>/dev/null; then
    changed=1
  fi
  if [ "$changed" = 1 ]; then
    echo "-- after-pull: deps changed or missing → npm install"
    npm install --no-audit --no-fund || echo "!! npm install failed — run it manually" >&2
  fi
  node scripts/link-pi.mjs || echo "!! link-pi.mjs failed" >&2
else
  echo "!! npm not found — install Node (nvm recommended), then: sh scripts/bootstrap.sh" >&2
fi

# 2. pidoc shim (bin/ is gitignored, so git never delivers it)
mkdir -p bin
cat > bin/pidoc <<EOF
#!/bin/sh
exec node "$ROOT/skills/pidoc/scripts/pidoc.mjs" "\$@"
EOF
chmod +x bin/pidoc

# 3. piread (native read tool, default-on — PI_NATIVE_READ=0 opts out;
#    falls back to the built-in read without the binary). Rebuild when
#    missing or older than crate sources; pidx staleness is handled by the
#    pidoc --fix step below. Builds from the custom-tools workspace (-p).
PIREAD_CRATE=custom-tools/piread
PIREAD_TARGET=custom-tools/target/release/piread
if [ -d "$PIREAD_CRATE/src" ] && [ -f "$PIREAD_CRATE/Cargo.toml" ]; then
  CARGO=$(command -v cargo || true)
  [ -z "$CARGO" ] && [ -x "$HOME/.cargo/bin/cargo" ] && CARGO="$HOME/.cargo/bin/cargo"
  stale=0
  if [ ! -x bin/piread ]; then
    stale=1
  elif [ -n "$(find "$PIREAD_CRATE/src" -name '*.rs' -newer bin/piread -print 2>/dev/null | head -n 1)" ] \
    || [ -n "$(find "$PIREAD_CRATE/Cargo.toml" -newer bin/piread -print 2>/dev/null)" ]; then
    stale=1
  fi
  if [ "$stale" = 1 ]; then
    if [ -n "$CARGO" ]; then
      if (cd custom-tools && "$CARGO" build --release -p piread) && cp "$PIREAD_TARGET" bin/piread; then
        echo "== piread: rebuilt + installed to bin/piread"
      else
        echo "!! piread rebuild failed — extension falls back to the built-in read" >&2
      fi
    else
      echo "== piread: stale/missing and cargo not found — extension falls back to the built-in read"
    fi
  fi
fi

# 4. piedit (native edit tool, default-on — PI_NATIVE_EDIT=0 opts out;
#    falls back to the built-in edit without the binary). Same staleness
#    rule as piread; builds from the custom-tools workspace (-p).
PIEDIT_CRATE=custom-tools/piedit
PIEDIT_TARGET=custom-tools/target/release/piedit
if [ -d "$PIEDIT_CRATE/src" ] && [ -f "$PIEDIT_CRATE/Cargo.toml" ]; then
  CARGO=$(command -v cargo || true)
  [ -z "$CARGO" ] && [ -x "$HOME/.cargo/bin/cargo" ] && CARGO="$HOME/.cargo/bin/cargo"
  stale=0
  if [ ! -x bin/piedit ]; then
    stale=1
  elif [ -n "$(find "$PIEDIT_CRATE/src" -name '*.rs' -newer bin/piedit -print 2>/dev/null | head -n 1)" ] \
    || [ -n "$(find "$PIEDIT_CRATE/Cargo.toml" -newer bin/piedit -print 2>/dev/null)" ]; then
    stale=1
  fi
  if [ "$stale" = 1 ]; then
    if [ -n "$CARGO" ]; then
      if (cd custom-tools && "$CARGO" build --release -p piedit) && cp "$PIEDIT_TARGET" bin/piedit; then
        echo "== piedit: rebuilt + installed to bin/piedit"
      else
        echo "!! piedit rebuild failed — extension falls back to the built-in edit" >&2
      fi
    else
      echo "== piedit: stale/missing and cargo not found — extension falls back to the built-in edit"
    fi
  fi
fi

# 5. Full health check; --fix rebuilds pidx when missing/stale and applies
#    any other safe fix. FAIL/WARN rows print their own fix hints.
if command -v node >/dev/null 2>&1; then
  node skills/pidoc/scripts/pidoc.mjs --fix || true
else
  echo "!! node not found — cannot verify setup" >&2
fi

exit 0
