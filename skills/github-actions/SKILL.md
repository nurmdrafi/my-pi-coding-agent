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
        | rg "^v?$major(\.[0-9]+)*$" | sort -V | tail -1)
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
- After removing an env var, rg the whole workflow dir for stale
  `env.<NAME>` references; actionlint does not catch undefined runtime env.

## 5–8. Restructuring and release workflows

- Removing a job (dangling `needs:`, lost toolchain setup) and deleting a build
  gates → `references/restructuring.md`.
- Version/tag derivation from one parser, tag-overwrite guards, multiline data
  between jobs → `references/release-versioning.md`.

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
