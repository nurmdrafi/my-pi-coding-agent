---
name: web-search
description: "Web search and URL content extraction via the Tavily CLI (tvly). SEARCH current information when no URL is known: 'search for', 'find articles about', 'what's the latest on'. EXTRACT clean markdown/text from specific URLs: 'extract', 'grab the content from', 'pull the text from', 'get the page at', 'read this webpage' — handles JavaScript-rendered pages, up to 20 URLs per call. Workflow: search → extract; --include-raw-content on a search can skip the extract step. NOT deep multi-source research reports (→ research)."
allowed-tools: Bash(tvly *)
disable-model-invocation: true
---

# web-search (tvly)

Two verbs, one CLI: **search** when you don't have a URL, **extract** when you do.

| You need | Command |
|----------|---------|
| Current info, no specific URL | `tvly search "query" --json` |
| Content of a known URL/page | `tvly extract "https://…" --json` |

## Before running any command

If `tvly` is not found on PATH, ask before installing — the installer is unpinned `curl | bash`:

```bash
curl -fsSL https://cli.tavily.com/install.sh | bash && tvly login
```

On approval, run the install and `tvly login`. If declined or the install fails, stop and say so — do not retry in a loop.

## Search

LLM-optimized results with content snippets and relevance scores.

```bash
# Basic
tvly search "your query" --json

# Advanced, more results
tvly search "quantum computing" --depth advanced --max-results 10 --json

# Recent news
tvly search "AI news" --time-range week --topic news --json

# Domain-filtered
tvly search "SEC filings" --include-domains sec.gov,reuters.com --json

# Full page content included (may save an extract call)
tvly search "react hooks tutorial" --include-raw-content --max-results 3 --json
```

| Option | Description |
|--------|-------------|
| `--depth` | `ultra-fast`, `fast`, `basic` (default), `advanced` |
| `--max-results` | Max results, 0-20 (default: 5) |
| `--topic` | `general` (default), `news`, `finance` |
| `--time-range` | `day`, `week`, `month`, `year` |
| `--start-date` / `--end-date` | Date bounds (YYYY-MM-DD) |
| `--include-domains` / `--exclude-domains` | Domain filter (comma-separated) |
| `--country` | Boost results from country |
| `--include-answer` | AI answer (`basic` or `advanced`) |
| `--include-raw-content` | Full page content (`markdown` or `text`) |
| `--include-images` / `--include-image-descriptions` | Image results |
| `--chunks-per-source` | Chunks per source (advanced/fast depth only) |
| `-o, --output` | Save output to file |
| `--json` | Structured JSON output |

Depth: `ultra-fast`/`fast` when latency matters, `basic` (default) for
general use, `advanced` for precision/specific facts.

Tips:
- **Budget: `--max-results 3`, stop after 2-3 searches** — synthesize what you have before searching more; extra searches add context tokens every remaining turn, rarely signal.
- Keep queries under 400 characters — search query, not prompt.
- Break complex queries into sub-queries.
- Use `--include-raw-content` when you need full page text (saves a separate extract call).
- Read from stdin: `echo "query" | tvly search - --json`

## Extract

Clean markdown or text from one or more URLs (up to 20 per call).

```bash
# Single URL
tvly extract "https://example.com/article" --json

# Multiple URLs
tvly extract "https://example.com/page1" "https://example.com/page2" --json

# Query-focused (relevant chunks only)
tvly extract "https://example.com/docs" --query "authentication API" --chunks-per-source 3 --json

# JS-heavy pages
tvly extract "https://app.example.com" --extract-depth advanced --json

# Save to file
tvly extract "https://example.com/article" -o article.md
```

| Option | Description |
|--------|-------------|
| `--query` | Rerank chunks by relevance to this query |
| `--chunks-per-source` | Chunks per URL (1-5, requires `--query`) |
| `--extract-depth` | `basic` (default) or `advanced` (JS-rendered pages) |
| `--format` | `markdown` (default) or `text` |
| `--include-images` | Image URLs |
| `--timeout` | Max wait (1-60 seconds) |
| `-o, --output` | Save output to file |
| `--json` | Structured JSON output |

Tips:
- Try `basic` depth first; fall back to `advanced` if content is missing.
- `--query` + `--chunks-per-source` gets only relevant content instead of full pages.
- Batch larger lists into multiple calls (max 20 URLs per request).
- If search already returned the content via `--include-raw-content`, skip the extract step.
