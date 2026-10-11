/** Destructive/mutating bash analysis (H2): env/git-flag
 * normalization, quote-aware segment splitting, destructive and mutating
 * matchers.
 *
 * TRIPWIRE, NOT A BOUNDARY: this is shell-text pattern matching, not parsing.
 * It catches the realistic unsanctioned shapes at command positions; a
 * determined rewrite escapes it. AGENTS.md discipline and the user's eyes are
 * the actual boundary. */


/**
 * H5/B20 (2026-10-08): successful bash commands that mutate the working tree —
 * they legitimize verify re-runs exactly like an edit/write tool call (R10's
 * mutationSeq only counted edit/write, so `npm test → git pull → npm test`
 * false-blocked). Only ever relaxes R10 (more allows), never blocks more.
 * 2026-10-11: git subcommands (add/commit/push/tag/branch/cherry-pick/revert),
 * rm/mv/cp/mkdir/touch, npm/pnpm ci, npm run *build*; the file-redirect
 * alternative is no longer segment-start-anchored (`cd x && make > out` used
 * to miss). Tested on git-global-flag-normalized segments like DESTRUCTIVE.
 */
const MUTATING_CORE_SRC = String.raw`git\s+(?:pull|checkout|merge|rebase|stash|reset|restore|clean|rm|mv|add|commit|push|tag|branch|cherry-pick|revert)\b|npm\s+(?:i|install|uninstall|add|ci)\b|pnpm\s+(?:i|add|install|remove|ci)\b|yarn\s+(?:add|install|remove)\b|pip3?\s+install\b|(?:\S*\/)?(?:rm|mv|cp|mkdir|touch)\b|sed\s+[^|]*-i\b|prettier\b[^|]*--write\b|eslint\b[^|]*--fix\b|(?:npm|pnpm|yarn)\s+(?:run\s+)?\S*build\b`;
const CMD_POS_SRC = String.raw`(?:^|&&|\|\||;|\||\bdo\b|\bthen\b|\belse\b|\bdone\b|[{(]\s*|\bxargs\s+|\s-exec(?:dir)?\s+)\s*`;
const MUTATING_BASH = new RegExp(
  CMD_POS_SRC +
    MUTATING_CORE_SRC +
    String.raw`|(?<![=>!\-\d])(?:>>?)\s*(?!/?(?:dev|null|tmp)/?)[^\s&>]+`,
);

/**
 * H2 (2026-10-08, suite-evidence): commands that need explicit user approval
 * before running — the suite's must-ask tasks (t08 npm install, t09 git
 * reset --hard) failed 6/6 with AGENTS.md text alone: the model never asked.
 * With a UI (TUI/RPC) → ctx.ui.confirm dialog; headless/print → fail CLOSED
 * with a reason that tells the model to ask in chat and wait. The list mirrors
 * AGENTS.md "Safety" (single source of truth). Approved commands are
 * remembered verbatim for 2 min so an immediate re-send (hook retry) does not
 * re-prompt.
 *
 * 2026-10-11 (user direction): git commit/push REMOVED from this set —
 * commitlint (R9) and hooks still guard commits. Root cause of the
 * intermittent /ship print-only stop: a mid-flow re-key of promptApproves
 * left `git push` to fail closed and the model fell back to printing the
 * message. commit/push stay in MUTATING_CORE_SRC (R10 mutationSeq).
 *
 * TRIPWIRE, NOT A BOUNDARY (2026-10-11): this is shell-text pattern matching,
 * not parsing. It catches the realistic unsanctioned shapes at command
 * positions — segment head, after ;/&&/||/|/do/then/else/{/(/xargs/-exec —
 * plus bash -c "…"/$(…) wrapped payloads (core scanned anywhere), `> /etc`
 * redirects, DROP TABLE/DELETE FROM, find -delete. Quoted prose ("then rm")
 * can false-positive; a determined rewrite (base64, perl -e, env rm) escapes.
 * AGENTS.md discipline and the user's eyes are the actual boundary.
 */
/** S-3 (2026-10-12, user direction): remote/persistent side effects needing the
 * same confirm as installs/destructive ops — pipe-to-interpreter script runs
 * (curl|sh), DB migrations, deploys/releases. Inside CORE so they're
 * position-anchored (CMD_POS_SRC) and scanned anywhere inside sh -c / $()
 * wrapped payloads, like the rest of CORE. `curl|sudo sh` is already covered
 * by core `sudo`. */
const SIDE_EFFECT_SRC = String.raw`(?:curl|wget)\b[^|;&\n]*\|\s*(?:ba|z|da|fi)?sh\b|(?:npx|npm|pnpm|yarn|bun)\s+(?:run\s+)?\S*(?:migrat|deploy|publish)\S*|(?:npx\s+)?(?:\S*[/\\])?(?:prisma\s+(?:migrate|db\s+push)|knex\s+migrate|sequelize(?:-cli)?\s+db:migrate|alembic\s+(?:upgrade|downgrade)|flyway\s+migrate|db-migrate\s+up|migrate\b[^|;&\n]*\s(?:up|down))|(?:php\s+)?(?:\S*[/\\])?artisan\s+migrate|python(?:3)?\s+manage\.py\s+migrate|(?:\S*[/\\])?manage\.py\s+migrate|rake\s+db:migrate|dotnet\s+ef\s+database\s+update|(?:npx\s+)?(?:\S*[/\\])?(?:vercel|wrangler|serverless|sls|netlify|fly|flyctl|railway|terraform|tofu|cdk|pulumi|sst|kubectl|gcloud|aws|az)\b[^|;&\n]*(?:\s(?:deploy|apply|publish|up|destroy)|--prod)`;

const DESTRUCTIVE_CORE_SRC = String.raw`(?:sudo\b|(?:\S*\/)?rm\b|git\s+(?:reset\s+--hard|clean\b|checkout\s+--|restore\b)|npm\s+(?:i|install|uninstall|add)\b|pnpm\s+(?:i|add|install|remove)\b|yarn\s+(?:add|install|remove)\b|pip3?\s+install\b|brew\s+install\b|apt(?:-get)?\s+install\b|mkfs(?:\.\w+)?\b|dd\s+if=|` + SIDE_EFFECT_SRC + `)`;

const DESTRUCTIVE_BASH = new RegExp(
  CMD_POS_SRC +
    DESTRUCTIVE_CORE_SRC +
    String.raw`|>\s*/(?:etc|usr|var|boot|root)\b|\b(?:DROP\s+(?:TABLE|DATABASE)|DELETE\s+FROM)\b|\bfind\b[^|;&]*\s-[a-zA-Z]*delete\b`,
  "i",
);
/** bash/sh -c "…" and $(…) hide payloads inside quotes — for wrapped segments the bare core is scanned anywhere */
const SHELL_WRAPPED = /\b(?:ba|z|da|k)?sh\s+(?:-[a-zA-Z]+\s+)*-c\b|\$\(/;
const DESTRUCTIVE_ANYWHERE = new RegExp(DESTRUCTIVE_CORE_SRC, "i");
export const segmentDestructive = (seg: string): boolean =>
  DESTRUCTIVE_BASH.test(seg) ||
  (SHELL_WRAPPED.test(seg) && DESTRUCTIVE_ANYWHERE.test(seg));
export const APPROVED_WINDOW_MS = 2 * 60_000;

/** MUTATING/DESTRUCTIVE judged on the same env/git-flag-normalized segments as the tool_call path (2026-10-11) */
export const isMutatingCommand = (cmd: string): boolean =>
  splitSegments(cmd)
    .map(normalizeSegment)
    .some((s) => MUTATING_BASH.test(s) || segmentDestructive(s));



export function splitSegments(cmd: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | undefined;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === "\\") {
        cur += ch + (cmd[i + 1] ?? "");
        i++;
        continue;
      }
      if (ch === quote) quote = undefined;
      cur += ch;
      continue;
    }
    if (ch === "\\") {
      cur += ch + (cmd[i + 1] ?? ""); // unquoted \; \& \| — literals, not separators
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    const two = cmd.slice(i, i + 2);
    if (ch === "\n" || ch === ";" || two === "&&" || two === "||") {
      out.push(cur);
      cur = "";
      if (two === "&&" || two === "||") i++;
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** S-2 (2026-10-09, /ship-flow autoresearch): leading VAR=value assignments
 * (`GIT_TERMINAL_PROMPT=0 git push`) precede the subcommand and hid it from
 * the ^-anchored destructive/R9 matches — strip them first so an
 * env-prefixed mutation can never skip the confirm (B18's -C class of miss). */
const stripEnvPrefix = (seg: string) =>
  seg.replace(/^(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|[^\s"']+)\s+)+/, "");

/** item 1 (2026-10-11): strip env prefixes AND git global flags (-C dir,
 * --no-pager, -c k=v) once per segment — destructive and R9 both
 * judge the normalized segment, so `git -C . push` confirms like `git push`. */
export const normalizeSegment = (seg: string) =>
  stripEnvPrefix(seg).replace(
    /^git\s+((-[A-Za-z]\s+\S+|--[a-z-]+(?:=\S+)?|-[A-Za-z]+)(\s+|$))*/,
    "git ",
  );

/** what counts as chat approval of destructive work (AGENTS.md Safety:
 * approval in the invoking message counts — incl. /ship, /issue, /update-changelog) */
export const APPROVAL_RE =
  /\b(?:yes|y|approve[ds]?|go[ -]ahead|run it|do it|proceed|ship it)\b|^\/(?:ship|issue|update-changelog)\b/im;
