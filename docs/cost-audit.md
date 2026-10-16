# Cost audit

Measured token cost from session logs. Run from the repo root.

## Index sessions

```sh
pidx --out /tmp/pidx-extracts.jsonl
```

## Cost by category

```sh
jq -s '[.[] | select(.project=="/home/nurmdrafi/.pi/agent") | .turns[]] as $t | {cost_input:([$t[].usage.cost.input]|add), cost_output:([$t[].usage.cost.output]|add), cost_cacheRead:([$t[].usage.cost.cacheRead]|add), cost_total:([$t[].usage.cost.total]|add)}' /tmp/pidx-extracts.jsonl
```

## cacheRead growth within a session

```sh
jq -s '[.[] | select(.project=="/home/nurmdrafi/.pi/agent") | select((.turns|length)>50)] | .[0].turns as $t | {first10:([$t[0:10][].usage.cacheRead]|add/10), last10:([$t[-10:][].usage.cacheRead]|add/10)}' /tmp/pidx-extracts.jsonl
```

## Findings (2026-10, full index: 210 sessions / 10043 turns / $143.38)

- cacheRead is ~72.5% of spend; output ~15.2%; input ~12.3%.
- cacheRead grows with history length: ~7k at turn 10, ~40k at turn 100 (avg 65k/turn). Cost is roughly quadratic in turns.
- Per-turn cost by model: glm-5.3 ~$0.0200, deepseek-flash ~$0.00135 (22x). Model pricing dominates; model choice is out of scope for cost tuning here.
- Prefix size (AGENTS.md) is a minor term, far below 2% of an average turn (avg cacheRead 65k).

## Consequences

- Keep tool output out of context: `rg|head`, `jq` fields, `/tmp`.
- Start a fresh session per issue; lean on compaction.
- Prefer fewer turns per task; batch with `codemode`.
