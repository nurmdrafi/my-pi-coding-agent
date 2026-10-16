#!/bin/sh
# setup-ghostty.sh — recommend and configure Ghostty as the Pi harness terminal.
#
# macOS + Linux. This script only edits Ghostty's text configuration; it never
# installs a GUI application, never runs a package manager, and never overwrites
# a file without backing it up first. Re-running is idempotent.
#
# Usage:
#   sh scripts/setup-ghostty.sh [--check] [--dry-run] [--remove-legacy]
#                               [--config PATH]
#
# Overrides (mainly for tests / non-standard installs):
#   GHOSTTY_CONFIG  explicit Ghostty config file to edit
#   GHOSTTY_BIN     explicit ghostty executable (if set, PATH is not consulted)
#
# Exit codes:
#   0  configured, already configured, or (default mode) config written
#   1  --check found a missing keybind or a missing Ghostty
#   2  bad usage
set -u

PROG=setup-ghostty
MARKER='# Added by pi-agent-harness setup-ghostty.sh for Pi Alt+Backspace compatibility.'
DESIRED_KEYBIND='keybind = alt+backspace=text:\x1b\x7f'
DESIRED_NOSPACE='keybind=alt+backspace=text:\x1b\x7f'
INSTALL_URL='https://ghostty.org/docs/install/binary'

usage() {
  cat <<EOF
Usage: sh scripts/$PROG.sh [options]

Configure Ghostty as the recommended terminal for Pi (macOS + Linux).

Options:
  --check           report status only; exit 1 if unconfigured or Ghostty absent
  --dry-run         show the planned change without writing anything
  --remove-legacy   remove the legacy 'shift+enter=text:\n' mapping if present
  --config PATH     edit PATH instead of the platform-default config file
  -h, --help        show this help

Environment:
  GHOSTTY_CONFIG    explicit config file (same as --config)
  GHOSTTY_BIN       explicit ghostty executable; skips PATH lookup

Ghostty documentation: $INSTALL_URL
EOF
}

MODE=setup
REMOVE_LEGACY=0
EXPLICIT_CFG=${GHOSTTY_CONFIG:-}

while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check ;;
    --dry-run) MODE=dry ;;
    --remove-legacy) REMOVE_LEGACY=1 ;;
    --config) shift; EXPLICIT_CFG=${1:-} ;;
    --config=*) EXPLICIT_CFG=${1#--config=} ;;
    -h|--help) usage; exit 0 ;;
    *) printf '%s: unknown option: %s\n\n' "$PROG" "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

os=$(uname -s 2>/dev/null || echo unknown)
xdg=${XDG_CONFIG_HOME:-$HOME/.config}

# ---------- resolve the config file ----------
# Ghostty load order (later overrides earlier): XDG config.ghostty / config,
# then the macOS Application Support config.ghostty / config. We edit the last
# file that already exists so our keybind wins; otherwise we create the modern
# `config.ghostty` at the platform-default location.
if [ -n "$EXPLICIT_CFG" ]; then
  CFG=$EXPLICIT_CFG
  CFG_EXISTED=0
  [ -f "$CFG" ] && CFG_EXISTED=1
else
  candidates="$xdg/ghostty/config.ghostty
$xdg/ghostty/config"
  if [ "$os" = "Darwin" ]; then
    candidates="$candidates
$HOME/Library/Application Support/com.mitchellh.ghostty/config.ghostty
$HOME/Library/Application Support/com.mitchellh.ghostty/config"
  fi
  CFG=
  oldIFS=$IFS
  IFS='
'
  for c in $candidates; do
    [ -n "$c" ] || continue
    [ -f "$c" ] && CFG=$c
  done
  IFS=$oldIFS
  CFG_EXISTED=0
  if [ -n "$CFG" ]; then
    CFG_EXISTED=1
  else
    if [ "$os" = "Darwin" ]; then
      CFG="$HOME/Library/Application Support/com.mitchellh.ghostty/config.ghostty"
    else
      CFG="$xdg/ghostty/config.ghostty"
    fi
  fi
fi

# ---------- locate Ghostty (informational; never installed) ----------
ghostty_exe=
ghostty_app=
if [ -n "${GHOSTTY_BIN:-}" ]; then
  if [ -x "$GHOSTTY_BIN" ] && [ ! -d "$GHOSTTY_BIN" ]; then
    ghostty_exe=$GHOSTTY_BIN
  fi
else
  ghostty_exe=$(command -v ghostty 2>/dev/null || true)
  if [ -z "$ghostty_exe" ] && [ "$os" = "Darwin" ]; then
    for app in "/Applications/Ghostty.app" "$HOME/Applications/Ghostty.app"; do
      if [ -d "$app" ]; then
        ghostty_app=$app
        break
      fi
    done
  fi
fi
ghostty_found=0
if [ -n "$ghostty_exe" ] || [ -n "$ghostty_app" ]; then
  ghostty_found=1
fi

# ---------- scan the existing config ----------
# Emits: has_desired has_altbs has_legacy has_shell_none
scan() {
  DESIRED="$DESIRED_NOSPACE" awk '
    BEGIN { hd = 0; ha = 0; hl = 0; hn = 0 }
    {
      t = $0; sub(/^[ \t]+/, "", t)
      if (t ~ /^#/) next
      if ($0 ~ /^[ \t]*keybind[ \t]*=/) {
        n = $0; gsub(/[ \t]/, "", n)
        if (n == ENVIRON["DESIRED"]) hd = 1
        if (index($0, "alt+backspace") > 0) ha = 1
        if (index($0, "shift+enter") > 0) {
          v = $0; sub(/^[^=]*=[ \t]*/, "", v); sub(/[ \t]+$/, "", v)
          if (v == "shift+enter=text:\\n") hl = 1
        }
      }
      if ($0 ~ /^[ \t]*shell-integration[ \t]*=/) {
        v = $0; sub(/^[^=]*=[ \t]*/, "", v); sub(/[ \t]+$/, "", v)
        if (v == "none") hn = 1
      }
    }
    END { print hd + 0, ha + 0, hl + 0, hn + 0 }
  ' "$1" 2>/dev/null
}

# Drop active keybind lines the plan says to replace/remove, keep everything else.
filter() {
  ra=$1; rl=$2; f=$3
  REMOVE_ALTBS="$ra" REMOVE_LEGACY="$rl" awk '
    {
      t = $0; sub(/^[ \t]+/, "", t)
      if (t !~ /^#/ && $0 ~ /^[ \t]*keybind[ \t]*=/) {
        if (ENVIRON["REMOVE_ALTBS"] == "1" && index($0, "alt+backspace") > 0) next
        if (ENVIRON["REMOVE_LEGACY"] == "1" && index($0, "shift+enter") > 0) {
          v = $0; sub(/^[^=]*=[ \t]*/, "", v); sub(/[ \t]+$/, "", v)
          if (v == "shift+enter=text:\\n") next
        }
      }
      print
    }
  ' "$f"
}

if [ -f "$CFG" ]; then
  set -- $(scan "$CFG")
  has_desired=${1:-0}; has_altbs=${2:-0}; has_legacy=${3:-0}; has_shell_none=${4:-0}
else
  has_desired=0; has_altbs=0; has_legacy=0; has_shell_none=0
fi

need_keybind=0
[ "$has_desired" = 1 ] || need_keybind=1
need_remove_legacy=0
[ "$REMOVE_LEGACY" = 1 ] && [ "$has_legacy" = 1 ] && need_remove_legacy=1
change=0
[ "$need_keybind" = 1 ] && change=1
[ "$need_remove_legacy" = 1 ] && change=1

# ---------- report ----------
say "pi harness / Ghostty terminal setup"
say "  OS:          $os"
say "  config file: $CFG"
if [ -n "$ghostty_exe" ]; then
  ver=$("$ghostty_exe" --version 2>/dev/null | head -n 1 || true)
  say "  ghostty:     $ghostty_exe${ver:+ ($ver)}"
elif [ -n "$ghostty_app" ]; then
  say "  ghostty:     $ghostty_app"
else
  warn "Ghostty not found on this machine. Pi works in any terminal; to use"
  warn "Ghostty, install it for your platform and re-run this script:"
  warn "  $INSTALL_URL"
fi

if [ "$has_legacy" = 1 ]; then
  warn "legacy mapping detected: keybind = shift+enter=text:\\n"
  warn "It sends a raw linefeed, which Pi cannot distinguish from Ctrl+J and"
  warn "which prevents real Shift+Enter from reaching Pi. Remove it unless an"
  warn "older Claude Code setup still needs it (re-run with --remove-legacy)."
fi

if [ "$has_shell_none" = 1 ]; then
  warn "shell-integration = none is set. Ghostty's default (detect) is"
  warn "recommended — Pi uses OSC 133 prompt/working-directory reporting. Left"
  warn "unchanged; remove the line yourself if you want the default back."
fi

# ---------- check mode ----------
if [ "$MODE" = check ]; then
  rc=0
  if [ "$has_desired" = 1 ]; then
    say "OK: Pi Alt+Backspace keybind present."
  else
    say "MISSING: Pi Alt+Backspace keybind not configured (run this script)."
    rc=1
  fi
  if [ "$ghostty_found" = 1 ]; then
    say "OK: Ghostty binary found."
  else
    say "MISSING: Ghostty not installed ($INSTALL_URL)."
    rc=1
  fi
  exit $rc
fi

# ---------- no-op ----------
if [ "$change" = 0 ]; then
  say "OK: already configured — no change."
  exit 0
fi

# ---------- plan ----------
if [ "$need_keybind" = 1 ]; then
  if [ "$has_altbs" = 1 ]; then
    say "  plan: replace existing alt+backspace keybind with the Pi mapping"
  else
    say "  plan: add '$DESIRED_KEYBIND'"
  fi
fi
if [ "$need_remove_legacy" = 1 ]; then
  say "  plan: remove legacy shift+enter mapping"
fi

if [ "$MODE" = dry ]; then
  say "dry-run: no files written."
  exit 0
fi

# ---------- write (backup + atomic replace) ----------
mkdir -p "$(dirname "$CFG")" || { warn "cannot create $(dirname "$CFG")"; exit 1; }

if [ "$CFG_EXISTED" = 1 ]; then
  bak="$CFG.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$CFG" "$bak" || { warn "cannot back up $CFG"; exit 1; }
  say "  backup: $bak"
fi

tmp="$CFG.tmp.$$"
rm -f "$tmp"
if [ "$CFG_EXISTED" = 1 ]; then
  # stage a copy first so the atomic replace keeps the original file mode
  cp -p "$CFG" "$tmp" || { warn "cannot stage $CFG"; exit 1; }
  filter "$need_keybind" "$need_remove_legacy" "$CFG" > "$tmp" || { rm -f "$tmp"; warn "rewrite failed"; exit 1; }
else
  : > "$tmp"
fi
if [ "$need_keybind" = 1 ]; then
  printf '%s\n' "$MARKER" "$DESIRED_KEYBIND" >> "$tmp"
fi
mv "$tmp" "$CFG" || { rm -f "$tmp"; warn "cannot write $CFG"; exit 1; }
say "OK: configured $CFG"
exit 0
