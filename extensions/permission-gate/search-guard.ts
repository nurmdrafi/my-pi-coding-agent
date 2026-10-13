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

/**
 * nested = codemode/executeTool sub-call: the result reaches only the calling
 * script, which filters it — SS1's crawl-cost premise does not apply. PB1
 * (deterministic BSD failure) and NM1 (user-approval policy) still block.
 */
export function searchCheck(
  seg: string,
  isDarwin: boolean,
  nested = false,
): string | undefined {
  const toks = tokens(seg);
  let i = 0;
  if (toks[i] === "sudo") i++;
  const head = toks[i] ?? "";
  if (head !== "grep" && head !== "egrep" && head !== "fgrep") {
    if (/^(?:find|rg|cat|head|tail)$/.test(head) &&
        toks.some((t) => isNodeModulesToken(t) && !isEarendilExempt(t)))
      return NM1_MSG;
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
  if (recursive && unscoped && !includeScoped && !nested)
    return "Search (Scope): recursive grep with no path/glob scope crawls node_modules/.git and timed out at 30s — scope it (grep -rn --include='*.ts' PATTERN src/) or use rg PATTERN src/.";
  if ([...paths, ...opts].some((t) => isNodeModulesToken(t) && !isEarendilExempt(t)))
    return NM1_MSG;
  return undefined;
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
