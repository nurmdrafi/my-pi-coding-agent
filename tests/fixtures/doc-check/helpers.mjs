// Temp-tree builder + README section builders for doc-check fixtures.
// Trees are built under os.tmpdir(), never inside the repo — the real doc-check
// walk would otherwise scan repo-side fixture markdown as declarations.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// spec:
//   skills:     ['alpha'] | [{ name, skillMd?: false, scripts?: [{ path, content }] }]
//   extensions: ['alpha'] | [{ name, ts?: string | false, readme?: string, files?: [{ path, content }] }]
//   extFiles:   [{ path, content }] — top-level files under extensions/ (e.g. handoff.ts)
//   scripts:    [{ name, content }] — top-level scripts/*.mjs
//   readme / extReadme: full file contents for README.md / extensions/README.md
export function mkTree(spec = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'doc-check-'));
  const put = (rel, content) => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  };
  for (const s of spec.skills ?? []) {
    const name = s.name ?? s;
    if (s.skillMd !== false) put(join('skills', name, 'SKILL.md'), `# ${name}\n\n${name} skill body.\n`);
    for (const f of s.scripts ?? []) put(join('skills', name, 'scripts', f.path), f.content);
  }
  for (const e of spec.extensions ?? []) {
    const name = e.name ?? e;
    if (e.ts !== false) put(join('extensions', name, 'index.ts'), e.ts ?? `// ${name} extension\n`);
    if (e.readme) put(join('extensions', name, 'README.md'), e.readme);
    for (const f of e.files ?? []) put(join('extensions', name, f.path), f.content);
  }
  for (const f of spec.extFiles ?? []) put(join('extensions', f.path), f.content);
  for (const s of spec.scripts ?? []) put(join('scripts', s.name), s.content);
  if (spec.readme) put('README.md', spec.readme);
  if (spec.extReadme) put(join('extensions', 'README.md'), spec.extReadme);
  return dir;
}

export const rmTree = (dir) => rmSync(dir, { recursive: true, force: true });

// Section builders pin the REAL README shapes (padded headers, dash separators,
// `/skill:<name>` invocation cells) so extraction is tested against reality.
export function skillsSection(rows) {
  // rows: 'alpha' | { name, inv? } — inv defaults to `/skill:<name>`
  const cells = rows.map((r) => {
    const name = r.name ?? r;
    return [name, `Does ${name} things.`, r.inv ?? `/skill:${name}`];
  });
  const head = ['Skill', 'Purpose', 'Invocation'];
  const width = [0, 1, 2].map((i) => Math.max(head[i].length, ...cells.map((c) => c[i].length)));
  const line = (c) => `| ${c.map((x, i) => x.padEnd(width[i])).join(' | ')} |`;
  return [
    '## Skills',
    '',
    'All skills are **manual** — invoke with `/skill:<name>`.',
    '',
    line(head),
    line(width.map((w) => '-'.repeat(w))),
    ...cells.map(line),
  ].join('\n');
}

export function extensionsSection(names) {
  return [
    '## Extensions',
    '',
    'Always-on TypeScript modules in `extensions/` — loaded by pi, never in the model prefix.',
    '',
    ...names.map((n) => `- **\`${n}/\`** — a \`${n}\` extension providing fixture behavior.`),
    '',
  ].join('\n');
}

export function makeReadme({ skills, extensions, extra } = {}) {
  return [
    '# fixture repo',
    '',
    skills ? skillsSection(skills) : '',
    extensions ? extensionsSection(extensions) : '',
    extra ?? '',
    '',
  ].filter((s) => s !== '').join('\n');
}
