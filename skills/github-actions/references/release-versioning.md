# Release versioning and job-to-job data

Steps 7–8 of hardening procedure.

## Release version from one parser only

Version-source-of-truth first: before touching release CI, check how repo derives version — e.g. version extracted directly from `CHANGELOG.md` (no script), `generate-version.mjs` runs in Actions without build setup, repo relies on build-only-on-main + husky tag guard. Never assume `package.json`/release script = source of truth; read repo before designing workflow.

Workflow derives version (image tag, git tag, release) via shell-side `grep`/`cut` on `CHANGELOG.md` → silently diverges from app's own parser. Two parsers = two contracts: workflow tags `main-Unreleased` while built app reports previous version.

CI invokes repository's own parser when one exists — exits non-zero on malformed entry, the failure you want — then read result, gate strictly so non-release heading can't become tag:

```sh
node scripts/generate-version.mjs          # single parser; exits 1 on bad input
VERSION=$(sed -n "s/^export const APP_VERSION = '\(.*\)'$/\1/p" src/version.js)
[ -n "$VERSION" ] || { echo "ERROR: no version in src/version.js"; exit 1; }
# reject [Unreleased], 1.2, any suffix — released tag = x.y.z
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { echo "ERROR: '$VERSION' is not x.y.z"; exit 1; }
```

Generated files usually git-ignored, absent after checkout — run generator before reading output, never stage generated file.

Immutable-tag overwrite guard: ask remote, not local clone (runner checkout may carry no tags):

```sh
if git ls-remote --tags origin "refs/tags/v$VERSION" | grep -q .; then
  echo "ERROR: tag v$VERSION already exists"; exit 1
fi
```

Prove guard both ways vs real remote state before trusting: existing tag must trip it, releasing version must pass. Match against genuinely existing remote tag; fabricated version tests only empty case — the half that can't fail loudly.

## Passing data between jobs

Multiline values (release notes, plans, JSON) survive job boundaries via EOF-delimited `GITHUB_OUTPUT` block; flow intact through `outputs:` → `needs.<job>.outputs.<key>`:

```sh
echo "notes<<EOF" >> $GITHUB_OUTPUT
echo "$NOTES" >> $GITHUB_OUTPUT
echo "EOF" >> $GITHUB_OUTPUT
```
