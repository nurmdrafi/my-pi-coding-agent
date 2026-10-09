# Restructuring workflows — removing jobs and build gates

Steps 5–6 of the hardening procedure. Moved verbatim from the SKILL.md body.

## Removing a job: audit `needs:` and any setup it carried

Deleting a job looks like deleting a block; it is really two edits.

- rg for `needs:` before removing. A surviving `needs: <deleted-job>` is
dangling — GitHub rejects the whole workflow, so the failure lands at the
next push rather than at edit time:

  ```sh
  rg -n 'needs:' .github/workflows/
  ```

- A job is also the only place its toolchain was set up. Removing a
  build/verify job commonly removes the sole `actions/setup-node` (or
  `setup-python`, `setup-go`), silently moving later steps onto whatever the
  runner image happens to ship. The steps still work today and break when the
  image rotates. rg for the setup action after removing a job:

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

## Deleting a build gate is a decision, not a cleanup

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
