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

# 3. Full health check; --fix rebuilds pidx when missing/stale and applies
#    any other safe fix. FAIL/WARN rows print their own fix hints.
if command -v node >/dev/null 2>&1; then
  node skills/pidoc/scripts/pidoc.mjs --fix || true
else
  echo "!! node not found — cannot verify setup" >&2
fi

exit 0
