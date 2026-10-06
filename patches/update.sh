#!/bin/sh
# pi package update + local patch re-application.
#
# `pi update --extensions` reconciles package checkouts to their pinned refs,
# which wipes locally applied patches. Run this INSTEAD of the raw command:
# it updates, re-applies every *.patch in this directory to the
# pi-interactive-subagents clone, and fails loudly when a patch no longer fits.
#
# Usage: patches/update.sh              (update all packages, then patch)
#        patches/update.sh --no-update  (re-apply/verify patches only)
set -e

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG="$PATCH_DIR/../git/github.com/amosblomqvist/pi-interactive-subagents"

if [ "$1" != "--no-update" ]; then
	pi update --extensions
fi

cd "$PKG"
for p in "$PATCH_DIR"/*.patch; do
	name="$(basename "$p")"
	if git apply --check "$p" 2>/dev/null; then
		git apply "$p"
		echo "applied: $name"
	elif git apply --reverse --check "$p" 2>/dev/null; then
		echo "already applied: $name"
	else
		echo "FAILED: $name does not apply (upstream moved?) — patch kept, resolve manually" >&2
		exit 1
	fi
done
echo "patched tree:"
git status --porcelain -- pi-extension | sed "s/^/  /"
