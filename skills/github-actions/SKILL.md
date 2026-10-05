---
name: github-actions
description: Authors and hardens GitHub Actions workflow files (.github/workflows) — pins actions to commit SHAs via gh api tag resolution, scopes secrets out of workflow-level env, applies least-privilege permissions via workflow/job-level only, validates with actionlint. Use when creating, editing, or fixing CI workflows, when a review or issue flags unpinned actions, secret exposure, or over-broad permissions, or when pinning actions and reusable workflows to SHAs. NOT for general pre-push diff review (use pre-push-review) or non-GitHub CI systems.
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

## 2. Pin every `uses:` to a full commit SHA

Mutable tags (`@v3`, `@v1`) can be moved by anyone with write access to the
action repo — a moved tag is remote code execution inside the workflow. Pin to
the 40-char SHA with the tag as a comment; Dependabot bumps the pin by reading
that comment.

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

- Pin everything, including first-party (`actions/*`, `docker/*`) — once
  Dependabot manages bumps, uniform pinning costs nothing and removes the
  "is this third-party?" judgment call.
- Pin the current major only. Do not jump majors in the same change; let
  Dependabot propose major upgrades separately.
- Reusable workflows pin the same way:
  `uses: org/repo/.github/workflows/x.yml@<sha> # v1`. Repos with a single
  moving major tag (only `v1`, no patches) still pin — Dependabot tracks the
  comment when the tag moves.

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

## 5. Passing data between jobs

Multiline values (release notes, plans, JSON) survive job boundaries when set
with an EOF-delimited `GITHUB_OUTPUT` block; they flow intact through
`outputs:` → `needs.<job>.outputs.<key>`:

```sh
echo "notes<<EOF" >> $GITHUB_OUTPUT
echo "$NOTES" >> $GITHUB_OUTPUT
echo "EOF" >> $GITHUB_OUTPUT
```

## 6. Dependabot keeps pins fresh

Pinning without automated bumps rots into stale SHAs. Add
`.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      actions:
        patterns:
          - "*"
```

## Checklist

- [ ] actionlint exit 0 (re-run after each fix)
- [ ] Every `uses:` is a 40-char SHA with a `# vX.Y.Z` comment
- [ ] No `${{ secrets.* }}` in workflow-level `env`
- [ ] Workflow defaults to least privilege; write grants isolated in their own job
- [ ] Self-hosted runners only on private repos or with isolated/ephemeral
      runners — never on public repos (pull_request_target pwn risk)
