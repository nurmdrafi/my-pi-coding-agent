#!/bin/sh
# pi-ghostty.sh — start Pi, preferring Ghostty when launched outside a terminal.
#
# If you are already in a terminal (Ghostty or any other), Pi runs right here —
# no new window is opened. If you launch it from outside a terminal (desktop
# launcher, hotkey, shortcut), it opens a Ghostty window in the current working
# directory and runs Pi there. Pi's own terminal detection, keyboard protocol,
# image, and color handling are left untouched — no TERM or protocol variables
# are forced.
#
# Usage: sh scripts/pi-ghostty.sh [pi args...]
#
# Environment:
#   GHOSTTY_BIN   explicit ghostty executable; if set, PATH is not consulted
set -u

PROG=pi-ghostty

usage() {
  cat <<EOF
Usage: sh scripts/$PROG.sh [pi args...]

Start Pi. In a terminal it runs in place; outside a terminal it opens a
Ghostty window in the current directory. All arguments are passed to pi.

Environment:
  GHOSTTY_BIN   explicit ghostty executable; if set, PATH is not consulted

Ghostty documentation: https://ghostty.org/docs/install/binary
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
  esac
done

# Already inside a terminal? Run Pi here, in any terminal emulator.
if [ -t 0 ] || [ -t 1 ]; then
  exec pi "$@"
fi

# No terminal attached — hand off to Ghostty if it is available.
ghostty_bin=
if [ -n "${GHOSTTY_BIN:-}" ]; then
  if [ -x "$GHOSTTY_BIN" ] && [ ! -d "$GHOSTTY_BIN" ]; then
    ghostty_bin=$GHOSTTY_BIN
  fi
elif command -v ghostty >/dev/null 2>&1; then
  ghostty_bin=$(command -v ghostty)
fi

if [ -n "$ghostty_bin" ]; then
  exec "$ghostty_bin" --working-directory="$PWD" -e pi "$@"
fi

cat >&2 <<EOF
$PROG: no terminal attached and Ghostty was not found.
Run Pi in your current terminal instead:  pi
Install Ghostty: https://ghostty.org/docs/install/binary
EOF
exit 1
