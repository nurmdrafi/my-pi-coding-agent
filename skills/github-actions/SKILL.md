---
name: github-actions
description: Authors and hardens GitHub Actions workflow files (.github/workflows) — pins actions to commit SHAs via gh api tag resolution, scopes secrets out of workflow-level env, applies least-privilege permissions via workflow/job-level only, validates with actionlint. Use when creating, editing, or fixing CI workflows, when removing or restructuring jobs (auditing `needs:` and lost toolchain setup), when a release pipeline derives a version or tag from CHANGELOG.md, when a review or issue flags unpinned actions, secret exposure, over-broad permissions, missing build gates, or tag overwriting. NOT for general pre-push diff review (use pre-push-review) or non-GitHub CI systems.
disable-model-invocation: true
---

# GitHub Actions workflows

Editing workflow files is a privileged operation: every `uses:` runs third-party
code with whatever secrets and GITHUB_TOKEN scopes the job holds. Treat the
steps below as the standard procedure for creating or hardening workflows.

## 1. Validate every edit with actionlint

The schema check catches what review misses — invalid step keys, bad
expressions, wrong `permissions` placement. Never eyeball a workflow diff as
the only check.

```sh
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color
```

Docker daemon down → standalone binary (args are `VERSION DIR`, in that order —
`latest /tmp`, not `/tmp latest`):

```sh
curl -sfL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash -o /tmp/dl-actionlint.sh
bash /tmp/dl-actionlint.sh latest /tmp && /tmp/actionlint
```

Use `-shellcheck=` to skip shellcheck if unavailable locally. Re-run after
every fix until exit 0.

Exit 0 alone proves nothing — actionlint reports success when it parsed
nothing at all. Two ways it silently passes:

- Outside a git repository it prints `no project was found` and exits 0.
- Injected YAML that is syntactically valid but semantically wrong (unpinned
  `@v4`, a job nothing `needs:`) also exits 0.

Confirm the parser is live before trusting a pass: temporarily append a real
error (a step-level `permissions:` key is guaranteed invalid) and check that
actionlint exits 1 and names the key. Delete the temp copy afterwards.

## 2. Pin every `uses:` to a full commit SHA

Mutable tags (`@v3`, `@v1`) can be moved by anyone with write access to the
action repo — a moved tag is remote code execution inside the workflow. Pin to
the 40-char SHA with the tag as a comment.

Resolve tag → SHA via gh api:

```sh
for spec in actions/checkout:4 docker/login-action:3; do
  repo="${spec%:*}"; major="${spec##*:}"
  tag=$(gh api "repos/$repo/tags" --paginate --jq '.[].name' \
        | grep -E "^v?$major(\.[0-9]+)*$" | sort -V | tail -1)
  sha=$(gh api "repos/$repo/commits/$tag" --jq '.sha')
  echo "$repo@$sha # $tag"
done
```

```yaml
uses: docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9 # v3.7.0
```

- Pin everything, including first-party (`actions/*`, `docker/*`) — uniform
  pinning costs nothing and removes the
  "is this third-party?" judgment call.
- Pin the current major only. Do not jump majors in the same change.
- Reusable workflows pin the same way:
  `uses: org/repo/.github/workflows/x.yml@<sha> # v1`. Repos with a single
  moving major tag (only `v1`, no patches) still pin.

## 3. Permissions: workflow and job level only — never step level

`permissions` is not a valid step key (valid action-step keys: continue-on-error,
env, id, if, name, timeout-minutes, uses, with). Planning a step-level
permissions block is a known trap; the schema rejects it.

```yaml
permissions:
  contents: read        # workflow default: least privilege
jobs:
  build:
    outputs:
      version: ${{ steps.version.outputs.version }}
  release:
    needs: build
    permissions:
      contents: write   # the only place write is granted
```

Scope a write grant by splitting the write-needing steps into their own job
(`needs:` + job-level `permissions`), passing data through job outputs. The
extra job costs ~1 billed minute; the write-scoped token never reaches build
or notify steps.

## 4. Keep secrets out of workflow-level `env`

Everything in workflow-level `env` is visible to every step — including
third-party actions that have no business seeing it. Move each secret to the
consuming step's `with:`:

```yaml
# BAD: whole-workflow exposure
env:
  DOCKER_PASSWORD: ${{ secrets.DOCKER_PAT }}
# GOOD: only the consuming (pinned!) action sees it
- uses: docker/login-action@<sha> # vX.Y.Z
  with:
    password: ${{ secrets.DOCKER_PAT }}
```

- The consuming third-party action necessarily sees the secret — which is why
  it must be SHA-pinned (step 2).
- Non-secrets (usernames, image names) may stay in workflow `env` — they are
  used by multiple steps and carry no exposure risk.
- After removing an env var, grep the whole workflow dir for stale
  `env.<NAME>` references; actionlint does not catch undefined runtime env.

## 5. Removing a job: audit `needs:` and any setup it carried

Deleting a job looks like deleting a block; it is really two edits.

- Grep for `needs:` before removing. A surviving `needs: <deleted-job>` is
dangling — GitHub rejects the whole workflow, so the failure lands at the
next push rather than at edit time:

  ```sh
  rg -n 'needs:' .github/workflows/
  ```

- A job is also the only place its toolchain was set up. Removing a
  build/verify job commonly removes the sole `actions/setup-node` (or
  `setup-python`, `setup-go`), silently moving later steps onto whatever the
  runner image happens to ship. The steps still work today and break when the
  image rotates. Grep for the setup action after removing a job:

  ```sh
  rg -n 'setup-node|setup-python|setup-go' .github/workflows/
  ```

  If a remaining step runs a language tool, restore the setup action into that
  job with a pinned SHA, or the version is unversioned infrastructure.

Parse the file with a real YAML parser afterwards rather than eyeballing —
`python3 -c 'import yaml,sys; print(yaml.safe_load(open(sys.argv[1])))' <file>`,
or Ruby's `YAML.load_file`; both are stdlib and present on macOS and Linux.
Then list job keys and `needs:` targets and check every target resolves to a
real job. An unquoted `$GITHUB_OUTPUT` is also worth fixing while here: use
`"$GITHUB_OUTPUT"` so a path with spaces cannot split.

## 6. Deleting a build gate is a decision, not a cleanup

A `verify` / `build-check` job that runs install + build before a deploy is
the only thing standing between a broken tree and a published image. Removing
it is a policy change: the deploy job's own build still compiles the app, so
compile errors surface later rather than never, but no signal reaches pull
requests. State that trade-off in the commit message and in any open issue
that asked for the gate, so the gap is recorded rather than rediscovered.

A pre-push git hook is not a substitute for a CI gate even when present —
hooks are skipped by `--no-verify`, are not installed on every clone, and are
invisible to the reviewer of a pull request. Verify the hook exists before
trusting a claim that one enforces something (`ls .husky/`, the `husky` key in
`package.json`, `git config core.hooksPath`) — it is often proposed in a review
and never committed.

## 7. Extract the release version from one parser only

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

## 8. Passing data between jobs

Multiline values (release notes, plans, JSON) survive job boundaries when set
with an EOF-delimited `GITHUB_OUTPUT` block; they flow intact through
`outputs:` → `needs.<job>.outputs.<key>`:

```sh
echo "notes<<EOF" >> $GITHUB_OUTPUT
echo "$NOTES" >> $GITHUB_OUTPUT
echo "EOF" >> $GITHUB_OUTPUT
```

## Checklist

- [ ] actionlint exit 0, confirmed against a deliberately broken temp copy
      (a pass from a non-git dir or from valid-but-wrong YAML means nothing)
- [ ] YAML re-parsed after structural edits; every `needs:` target resolves
- [ ] Removing a job: no dangling `needs:`, and any language toolchain the job
      set up (`setup-node` and friends) restored where it is still needed
- [ ] Every `uses:` is a 40-char SHA with a `# vX.Y.Z` comment
- [ ] No `${{ secrets.* }}` in workflow-level `env`
- [ ] Workflow defaults to least privilege; write grants isolated in their own job
- [ ] Version/tag derivation calls the repo's own parser, fails on non-semver,
      refuses an existing remote tag, and the guard was tested in both
      directions against real remote state
- [ ] A removed build gate and any waived acceptance criterion are recorded in
      the commit message and the related issue
- [ ] Self-hosted runners only on private repos or with isolated/ephemeral
      runners — never on public repos (pull_request_target pwn risk)
