# Release versioning and job-to-job data

Steps 7–8 of the hardening procedure. Moved verbatim from the SKILL.md body.

## Extract the release version from one parser only

Version-source-of-truth first: before touching release CI, check how the
repo actually derives its version — e.g. the version is extracted directly
from `CHANGELOG.md` (no script), `generate-version.mjs` runs in Actions
without any build setup, and the repo relies on build-only-on-main plus a
tag guard via husky. Do not assume `package.json` or a release script is the
source of truth; read the repo before designing the workflow.

When a workflow derives a version (for an image tag, a git tag, a release),
shell-side `grep`/`cut` on `CHANGELOG.md` silently diverges from the app's own
parser. Two parsers means two contracts: the workflow tags `main-Unreleased`
while the built app reports the previous version.

Have CI invoke the repository's own parser when one exists — it exits
non-zero on a malformed entry, which is the failure you want — then read the
result, and gate it strictly so a non-release heading cannot become a tag.

```sh
node scripts/generate-version.mjs          # the single parser; exits 1 on bad input
VERSION=$(sed -n "s/^export const APP_VERSION = '\(.*\)'$/\1/p" src/version.js)
[ -n "$VERSION" ] || { echo "ERROR: no version in src/version.js"; exit 1; }
# reject `[Unreleased]`, `1.2`, and any suffix — a released tag is x.y.z
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { echo "ERROR: '$VERSION' is not x.y.z"; exit 1; }
```

Generated files are usually git-ignored and therefore absent after checkout —
run the generator before reading its output, and never stage the generated file.

Guard against overwriting an immutable tag by asking the remote, not the local
clone (a runner checkout may carry no tags):

```sh
if git ls-remote --tags origin "refs/tags/v$VERSION" | grep -q .; then
  echo "ERROR: tag v$VERSION already exists"; exit 1
fi
```

Prove the guard both ways against real remote state before trusting it: an
existing tag must trip it, and the version you are about to release must pass.
Run the match against a tag that genuinely exists on the remote; a fabricated
version tests only the empty case, which is the half that cannot fail loudly.

## Passing data between jobs

Multiline values (release notes, plans, JSON) survive job boundaries when set
with an EOF-delimited `GITHUB_OUTPUT` block; they flow intact through
`outputs:` → `needs.<job>.outputs.<key>`:

```sh
echo "notes<<EOF" >> $GITHUB_OUTPUT
echo "$NOTES" >> $GITHUB_OUTPUT
echo "EOF" >> $GITHUB_OUTPUT
```
