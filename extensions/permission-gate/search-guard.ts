/**
 * Search/portability gate (SS/PB/NM) — mechanical enforcement of
 * docs/agent-hygiene.md "Toolchain" scope rules and docs/portability.md.
 *
 * 2026-10-13 session audit: unscoped repo-wide greps (`grep -rn … .`) timed
 * out at 30s twice; a `node_modules/.pnpm/…` path was read via the read tool;
 * `grep: invalid option -- P` on BSD grep.
 *
 * | ID  | Check                                            | Fix carried in the reason |
 * |-----|--------------------------------------------------|---------------------------|
 * | PB1 | grep -P on darwin (BSD grep lacks it)            | rg / grep -E              |
 * | SS1 | recursive grep with no path/glob scope           | scope path/--include or rg |
 * | NM1 | read tool + grep/find/rg/cat/head/tail into node_modules | docs/types, not the tree |
 * | SS2 | bare grep/egrep/fgrep head or mid-pipe (rg-first policy) | rg PATTERN path/           |
 * | SS3 | bare find head (fd-first policy)                    | fd PATTERN path/           |
 *
 * `ls node_modules/<pkg>` stays allowed (presence checks are legitimate);
 * rg is gitignore-aware and fast, so unscoped rg passes by design.
 */
const NM1_MSG =
  "Search (node_modules): dependency internals — ask the user before crawling node_modules; pi docs under node_modules/@earendil-works/ are pre-approved.";

/** quote-aware tokenizer: quoted runs stay one token (quotes stripped);
 * shell operators | < > stand alone so tokens past them are another command */
function tokens(seg: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | undefined;
  let has = false;
  const push = () => {
    if (has) {
      out.push(cur);
      cur = "";
      has = false;
    }
  };
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (quote) {
      if (ch === "\\") {
        cur += seg[i + 1] ?? "";
        i++;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
      continue;
    }
    if (ch === "\\" && i + 1 < seg.length) {
      cur += seg[i + 1];
      i++;
      has = true;
      continue;
    }
    if (ch === "|" || ch === ">" || ch === "<") {
      push();
      out.push(ch);
      continue;
    }
    if (/\s/.test(ch)) {
      push();
      continue;
    }
    cur += ch;
    has = true;
  }
  push();
  return out;
}

const isNodeModulesToken = (t: string) =>
  t === "node_modules" ||
  t.startsWith("node_modules/") ||
  /(^|\/)node_modules(\/|$)/.test(t);

/** user-approved 2026-10-13: @earendil-works (pi docs/types) reads are not a wasted crawl */
const isEarendilExempt = (t: string) =>
  t.startsWith("node_modules/@earendil-works/") ||
  t.includes("/node_modules/@earendil-works/");

/** SS2 (2026-10-16): AGENTS.md tooling defaults — rg is the search default;
 * grep/egrep/fgrep (segment head or mid-pipe) is fallback only when rg errors.
 * Fires after PB1/SS1/NM1 so their specific reasons still teach first. */
const SS2_MSG =
  "Search (rg-first): 'grep' is the fallback, not the default — use 'rg PATTERN path/' (scope with -t <lang> or a glob). If rg genuinely errored, say so in chat and wait for approval before using grep.";

/** SS3 (2026-10-16): AGENTS.md tooling defaults — fd is the file-find default;
 * find is fallback only when fd errors. Fires after NM1 so the node_modules
 * approval policy keeps its specific reason. */
const SS3_MSG =
  "Search (fd-first): 'find' is the fallback, not the default — use 'fd PATTERN path/' (regex pattern; -e exact, -H hidden, -t f files). If fd genuinely errored, say so in chat and wait for approval before using find.";

/**
 * SS1's crawl-cost premise applies to all searches.
 * PB1 (deterministic BSD failure) and NM1 (user-approval policy) still block.
 */
export function searchCheck(
  seg: string,
  isDarwin: boolean,
): string | undefined {
  const toks = tokens(seg);
  let i = 0;
  if (toks[i] === "sudo") i++;
  const head = toks[i] ?? "";
  if (head !== "grep" && head !== "egrep" && head !== "fgrep") {
    if (/^(?:find|rg|cat|head|tail)$/.test(head) &&
        toks.some((t) => isNodeModulesToken(t) && !isEarendilExempt(t)))
      return NM1_MSG;
    // SS3 fd-first: `find` head → fd (NM1's node_modules reason stays first)
    if (head === "find") return SS3_MSG;
    // SS2 mid-pipe: `… | grep …` in a segment headed by another command
    for (let k = 1; k < toks.length; k++)
      if (toks[k - 1] === "|" && /^(?:grep|egrep|fgrep)$/.test(toks[k]))
        return SS2_MSG;
    return undefined;
  }
  // grep: flags, then the pattern, then path args / mid-command options
  const flags: string[] = [];
  let j = i + 1;
  for (; j < toks.length && toks[j].startsWith("-") && toks[j] !== "-"; j++)
    flags.push(toks[j]);
  j++; // the pattern
  const rest: string[] = [];
  for (
    ;
    j < toks.length && toks[j] !== "|" && toks[j] !== ">" && toks[j] !== "<";
    j++
  )
    rest.push(toks[j]);
  const shortFlag = (ch: string) =>
    flags.some((f) => !f.startsWith("--") && f.slice(1).includes(ch));
  const hasLong = (name: string, all: string[]) =>
    all.some((f) => f === name || f.startsWith(name + "="));
  if (isDarwin && (shortFlag("P") || hasLong("--perl-regexp", flags)))
    return "Portability (grep -P): BSD grep has no -P (audit: 'grep: invalid option -- P') — use 'rg <pattern>' or 'grep -E'.";
  const paths = rest.filter((t) => !t.startsWith("-"));
  const opts = rest.filter((t) => t.startsWith("-"));
  const includeScoped = hasLong("--include", [...flags, ...opts]);
  const recursive =
    shortFlag("r") || shortFlag("R") || hasLong("--recursive", flags);
  const unscoped =
    paths.length === 0 ||
    paths.every((p) => p === "." || p === "./" || p === "..");
  if (recursive && unscoped && !includeScoped)
    return "Search (Scope): recursive grep with no path/glob scope crawls node_modules/.git and timed out at 30s — scope it (grep -rn --include='*.ts' PATTERN src/) or use rg PATTERN src/.";
  if ([...paths, ...opts].some((t) => isNodeModulesToken(t) && !isEarendilExempt(t)))
    return NM1_MSG;
  // user-approved 2026-10-13: grep into @earendil-works pi docs stays allowed
  return paths.length > 0 && paths.every(isEarendilExempt)
    ? undefined
    : SS2_MSG;
}

/** NM1 for the read tool: block reads of dependency internals */
export function nodeModulesPath(display: string): string | undefined {
  const d = display.replace(/\\/g, "/");
  if (!/(^|\/)node_modules(\/|$)/.test(d)) return undefined;
  // user-approved 2026-10-13: @earendil-works (pi docs/types) allowed
  if (/(^|\/)node_modules\/@earendil-works\//.test(d)) return undefined;
  const shown = display.length > 48 ? `…${display.slice(-47)}` : display;
  return `Search (node_modules): '${shown}' is dependency internals — ask the user before crawling node_modules; pi docs under node_modules/@earendil-works/ are pre-approved.`;
}
