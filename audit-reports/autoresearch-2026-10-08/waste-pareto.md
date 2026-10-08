# H0 Waste Pareto (session logs)

Token estimate: chars/4 of toolResult text (no per-call usage in logs). Assistant messages carry usage; summed ground truth: input=9798168, output=3379257, cacheRead=382978624, total=0 over 5923 msgs, 120 sessions.

W9 caveat: AGENTS.md (628 tok) + violation memory (109 tok) is re-sent every turn; attributed once per session here, so W9 is a large per-turn multiplier, not a per-session constant.

## Pareto (desc by est tokens)

| Bucket | Calls | Est tokens | Share % |
|---|---|---|---|
| W10 over-explanation | 277 | 170026 | 35 |
| W2 uncapped-dump | 67 | 110702 | 22.8 |
| W9 instruction-overhead | 120 | 88440 | 18.2 |
| W1 dup-read | 90 | 67096 | 13.8 |
| W8 failed-edit-retry | 67 | 41062 | 8.4 |
| W3 block-retry | 86 | 8647 | 1.8 |
| W5 unchanged-rerun | 11 | 336 | 0.1 |
| W6 speculative-check | 1 | 4 | 0 |
| W4 verbatim-resend | 0 | 0 | 0 |
| W7 needless-ask | 0 | 0 | 0 |
| **Total** | | **486313** | 100 |

## Gate blocks

Total 86, one-shot recovery 74.4%.

Families: Token Economy (Reading)=36, Token Economy (Re-run)=16, Anchor Guard=13, Token Economy (Re-read)=9, Token Economy (Extraction)=6, Token Economy (Command output)=4, Token Economy (git reads)=2

## Top-3 buckets

### W10 over-explanation — 170026 tok (35%)
- --home-nurmdrafi-.pi--/2026-08-11T14-55-38-164Z_019ff152-6ab4-78ea-a580-f9f03102b2bb.jsonl — assistant text 3171 chars: "## Reality check: no web-search tool in this harness

I veri..."
- --home-nurmdrafi-.pi--/2026-08-11T14-55-38-164Z_019ff152-6ab4-78ea-a580-f9f03102b2bb.jsonl — assistant text 2400 chars: "## My honest take: curl is the right *transport*, the wrong ..."
- --home-nurmdrafi-.pi--/2026-08-11T14-55-38-164Z_019ff152-6ab4-78ea-a580-f9f03102b2bb.jsonl — assistant text 4771 chars: "All 5 sources extracted clean — **including OpenAI** (which ..."

### W2 uncapped-dump — 110702 tok (22.8%)
- --home-nurmdrafi-.pi--/2026-08-11T15-46-14-685Z_019ff180-c01d-78bf-b0ec-30ba0cc3e3b0.jsonl — 4332 chars from: echo "=== .nvmrc ===" ; cat ~/.pi/agent/.nvmrc ; echo "=== p
- --home-nurmdrafi-.pi--/2026-08-11T15-46-14-685Z_019ff180-c01d-78bf-b0ec-30ba0cc3e3b0.jsonl — 7230 chars from: echo "=== changelog tail (format match) ===" ; tail -40 ~/.p

### W9 instruction-overhead — 88440 tok (18.2%)

## Notable sessions (by est waste tokens)

| Session | Calls | Result tok | Waste-classified tok |
|---|---|---|---|
| --home-nurmdrafi-Desktop-Barikoi-barikoi-admin-nextjs--/2026-08-14T15-16-40-920Z_01a000d8-c358-74ca-b9ea-7f8f40d3f3c5.jsonl | 120 | 67245 | 32035 |
| --home-nurmdrafi-.pi-agent--/2026-08-21T15-41-03-102Z_01a024fb-96fe-7508-ab0d-f40f19b1c6e4.jsonl | 121 | 42569 | 24886 |
| --home-nurmdrafi-Desktop-Barikoi-dropx-merchant--/2026-08-09T18-04-34-500Z_019fe7b2-ad44-7a7a-9277-0f282f482280.jsonl | 69 | 36337 | 19776 |
| --home-nurmdrafi-.pi-agent--/2026-09-23T17-23-42-943Z_01a0cf4b-70de-70f8-94ce-812625f4cc0e.jsonl | 50 | 33926 | 18611 |
| --home-nurmdrafi-Desktop-Barikoi-react-bkoi-gl--/2026-08-30T14-30-07-159Z_01a05313-e237-74a9-b25c-66de12154716.jsonl | 370 | 97293 | 15291 |
| --home-nurmdrafi-Desktop-Barikoi-react-bkoi-gl--/2026-08-25T15-38-15-744Z_01a03992-7940-7f74-8499-d2b48162050e.jsonl | 438 | 82729 | 14667 |
| --home-nurmdrafi-Desktop-Barikoi-react-bkoi-gl--/2026-08-26T09-46-26-671Z_01a03d76-bbee-7699-8509-b794f63530dc.jsonl | 435 | 96274 | 14581 |
| --home-nurmdrafi-Desktop-Barikoi-barikoi-admin-nextjs--/2026-08-14T19-27-39-497Z_01a001be-89e9-7e76-a3ea-7fbefa8edc13.jsonl | 2 | 12823 | 13557 |
| --home-nurmdrafi-.pi-agent--/2026-08-26T07-42-25-911Z_01a03d05-3277-76fd-b6a9-ab3ca6e4d954.jsonl | 38 | 47126 | 13527 |
| --home-nurmdrafi-.pi-agent--/2026-10-06T18-47-18-598Z_01a1128a-a544-77ea-afbe-a9a17bfd7c6f.jsonl | 162 | 32661 | 12440 |

## Heuristic confidence

- W1: medium (read-tool overlap only; misses bash sed/cat re-reads)
- W2: medium-high (result-size based)
- W3: high (gate prefixes exact)
- W4: low-medium (block→identical-cmd adjacency approximated)
- W5: medium (identical cmd + no edit/write between)
- W6: low (repeat status cmds only — subset of true speculative checks)
- W7: low (all ask_question counted; many legitimate)
- W8: high (isError on edit)
- W9: structural (file sizes, exact)
- W10: medium (text blocks > ~400 tokens)
