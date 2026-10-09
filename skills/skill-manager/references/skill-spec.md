# Skill spec and directory layout

Validator-enforced rules (`scripts/validate-skill.mjs`, run from the skill-manager
dir). Read while writing frontmatter or placing files. The Agent Skills spec is
at <https://agentskills.io/specification>; Pi's loader behavior at
`docs/skills.md` in the pi package.

## Hard rules (spec-enforced)

1. Skill = a directory containing exactly one `SKILL.md`; everything else freeform.
2. Frontmatter fields — only these (unknown fields are ignored by Pi):
   - `name` (required): 1–64 chars, lowercase `a-z 0-9 -` only, no leading/trailing hyphen, no `--`,
     no XML tags, no reserved words (`anthropic`, `claude`), and **must match the directory name**.
   - `description` (required): 1–1024 chars. This alone decides when the agent loads the skill.
   - Optional: `license`, `compatibility` (≤500 chars), `metadata`, `allowed-tools`,
     `disable-model-invocation`. Omit optionals unless genuinely needed. `allowed-tools` format:
     `Bash(tvly *)` — pre-approves only that tool pattern; use when a skill wraps one CLI.
3. Missing description → Pi refuses to load the skill. Everything else warns but loads.
4. Location for personal skills: `~/.pi/agent/skills/<name>/`. Project skills: `.pi/skills/<name>/`.

## Directory layout

```text
<name>/
├── SKILL.md        # required; the only loose file allowed at top level
├── scripts/        # executable code (.sh/.mjs/.py/...), incl. helper modules
├── references/     # additional docs read on demand (progressive disclosure)
└── assets/         # static resources: templates, images, data files, schemas
```

- Nothing loose in the root besides `SKILL.md` — executable or doc files in the
  root are the standard way skills rot. Bin+src splits (`bin/`, `src/`) also go under `scripts/`.
- `package.json` + `node_modules/` are tolerated for skills with declared deps
  (e.g. `browser-tools`); document the `npm install` step in the skill body.
- Keep `scripts/` flat unless a module needs its own subdirectory; scripts are
  referenced relative to the skill dir (`scripts/foo.sh`), not `./foo.sh`.
- Content goes to the dir matching its type: docs → `references/`, executables →
  `scripts/`, static data/templates → `assets/`.
