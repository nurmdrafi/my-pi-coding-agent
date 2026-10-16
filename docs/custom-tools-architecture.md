# Custom Tools Architecture

Four native Rust tools replace the pi built-in TypeScript tools. Each is a
standalone binary in `custom-tools/` with a matching extension in
`extensions/`. Every tool follows the same shape:

- **Extension** (`extensions/<name>/index.ts`) — individual registration, a
  **fail-open ladder** (`daemon → one-shot spawn → built-in`), and the
  session-sensitive glue (env + `PI_*` injection, cancellation, TUI render).
- **Daemon** (`--serve`) — a persistent NDJSON-over-stdio process so the hot
  path avoids per-call spawn cost. One request per line, id-matched, lazy
  restart on death, `unref`'d while idle / `ref`'d in flight.
- **One-shot** — a single `bin/<name>` spawn per call, the fallback when the
  daemon transport fails.
- **Built-in fallback** — the original TypeScript tool, the final rung.

Parity is pinned against the built-in by a harness suite (`tests/*-parity.test.mjs`)
and the permission-gate treats each native tool as a wrapper on the equivalent
event (`read`/`edit`/`bash`).

---

## Generic dispatch ladder

```mermaid
flowchart TB
    M[Model / core calls tool] --> E[Extension index.ts<br/>individual registration]
    E --> D{Daemon alive?}
    D -- yes --> DA[bin/X --serve<br/>NDJSON over stdio<br/>id-matched, lazy restart]
    D -- no / transport fails --> OS[One-shot spawn<br/>bin/X per call]
    DA -- spawn / timeout parity failure --> OS
    OS -- spawn / parse failure --> BF[Built-in TypeScript tool<br/>final fallback]
    DA --> RES[Envelope result to model]
    OS --> RES
    BF --> RES
```

---

## pibash — native shell-output pipeline

Owns spawn + streaming + capping + truncation + spill + envelope. The built-in
bash tool (`dist/core/tools/bash.js`) stays the *oracle*; the extension owns env
injection and TUI rendering.

```mermaid
flowchart TB
    subgraph EXT[extensions/pibash/index.ts]
        ENVV[Inject env + PI_* vars,<br/>resolve cwd, cancellation]
        TUIGET[TUI live render + cancel]
        OS[One-shot spawn<br/>bin/pibash per call]
        BF[Built-in bash<br/>final fail-open rung]
        DA[bin/pibash --serve<br/>NDJSON daemon]
    end

    subgraph CORE[custom-tools/pibash/src]
        CLI[cli.rs<br/>--command/--cwd/--timeout/--serve]
        RUNNER[runner.rs<br/>spawn child, stream,<br/>throttled RunObserver partials]
        ACC[accumulator.rs<br/>2000-line / 50KB spill cap<br/>pi-bash temp prefix]
        COMPRESS[compress.rs<br/>Tier-1 shadow pre-pass over FULL stream]
        TRUNC[truncate.rs<br/>oracle-shaped truncation object]
        RENDER[render.rs<br/>format_output + status append]
        ENV[envelope.rs<br/>Success / Failure JSON]
        SERVE[serve.rs<br/>NDJSON daemon, start/partial lines]
        MAIN[main.rs<br/>execute / execute_with / execute_observed]
    end

    ENVV --> D{Daemon alive?}
    D -- yes --> CLI
    D -- no / transport fails --> OS
    OS -- spawn / parse failure --> BF
    CLI --> MAIN
    MAIN --> RUNNER --> ACC
    ACC -->|full_text / spill path| COMPRESS
    COMPRESS -->|pruned to 40 lines / 2 KB| TRUNC
    TRUNC --> RENDER
    RENDER --> ENV
    ENV -->|envelope JSON| LADDER
    ACC -.->|fullOutputPath spill ref| ENV
    RUNNER -.->|pid + throttled partials| TUIGET
    DA -.->|spawn / timeout parity failure| OS
    ENV --> LADDER_OUT[Envelope to model]
    OS --> LADDER_OUT
    BF --> LADDER_OUT
```

Key decision: a **shadow pre-pass** compresses the *complete* output stream
(from the spill file when one exists) before the legacy tail/parity path, so
errors buried mid-stream survive. The model-visible budget is 40 lines / 2 KB
(the permission-gate H1 cap), tighter than the accumulator's 2000-line / 50 KB
spill cap.

---

## piread — native read pipeline

One invocation runs open → slice → render → truncate → binary-detect, printing
a single JSON envelope. Byte-for-byte parity with the built-in `read`.

```mermaid
flowchart TB
    subgraph EXT[extensions/piread/index.ts]
        IMG[Image extensions → private built-in read]
        OS[One-shot spawn<br/>bin/piread per call]
        BF[Built-in read<br/>final fail-open rung]
        DA[bin/piread --serve<br/>NDJSON daemon]
    end

    subgraph CORE[custom-tools/piread/src]
        CLI[cli.rs<br/>--path/--offset/--limit ≥ 1]
        ENV[envelope.rs<br/>Success/Failure + Node-style errors]
        PIPE[pipeline.rs<br/>streaming Segmenter + HeadTruncator]
        SERVE[serve.rs<br/>NDJSON daemon]
        MAIN[main.rs]
    end

    IMG --> D{Daemon alive?}
    D -- yes --> CLI
    D -- no / transport fails --> OS
    OS -- spawn / parse failure --> BF
    CLI --> MAIN --> PIPE
    PIPE -->|File::open → ENOENT/EACCES/EISDIR| ENV
    PIPE -->|NUL sniff first 8 KiB| ENV
    PIPE -->|offset beyond EOF| ENV
    ENV -->|envelope JSON| LADDER_OUT[Envelope to model]
    OS --> LADDER_OUT
    BF --> LADDER_OUT
    DA -.->|spawn / timeout parity failure| OS
    IMG -.->|non-image path continues| D
```

Memory contract: buffers at most `MAX_BYTES` (50 KB) of decoded output plus the
first line (for `firstLineExceedsLimit`); the rest of the file is scanned
(newline count, binary sniff) without buffering — a 1 GiB read costs O(cap).

---

## piedit — native edit pipeline

read → LF/BOM normalize → exact/fuzzy match → uniqueness/overlap validation →
apply → write → native diff/patch render.

```mermaid
flowchart TB
    subgraph EXT[extensions/piedit/index.ts]
        QUEUE[withFileMutationQueue<br/>re-entrancy guard]
        OS[One-shot spawn<br/>bin/piedit per call]
        BF[Built-in edit<br/>final fail-open rung]
        DA[bin/piedit --serve<br/>NDJSON daemon]
        DIFFTS[render diff via<br/>generateDiffString / generateUnifiedPatch]
    end

    subgraph CORE[custom-tools/piedit/src]
        CLI[cli.rs<br/>--path/--edits/--serve]
        PIPE[pipeline.rs<br/>normalizeToLF, detectLineEnding,<br/>splitBom, NFKC fuzzy match,<br/>apply, write]
        DIFF[diff.rs<br/>jsdiff port, byte-identical]
        ENV[envelope.rs<br/>diff/patch/firstChangedLine]
        SERVE[serve.rs]
        MAIN[main.rs]
    end

    QUEUE --> D{Daemon alive?}
    D -- yes --> CLI
    D -- no / transport fails --> OS
    OS -- spawn / parse failure --> BF
    CLI --> MAIN --> PIPE
    PIPE -->|exact/fuzzy match fails| ENV
    PIPE --> DIFF
    DIFF -->|diff + unified patch| ENV
    ENV -->|envelope JSON| LADDER_OUT[Envelope to model]
    OS --> LADDER_OUT
    BF --> LADDER_OUT
    DA -.->|spawn / timeout parity failure| OS
    LADDER_OUT -.->|legacy baseContent/newContent| DIFFTS
```

The native dispatch runs under `withFileMutationQueue`; if it returns a
`{fallback}` sentinel the queue is released first, then the built-in executor
runs — avoiding the deadlock of re-entering the same queue.

---

## pidx — incremental session-log indexer

Parses `<sessions-dir>/<project>/<ISO-ts>_<uuid>.jsonl` transcripts into compact
per-session extracts consumed by session-audit's fast path.

```mermaid
flowchart TB
    subgraph EXT[extensions/pidx/index.ts]
        REG[First-class pidx tool registration]
    end

    subgraph CORE[custom-tools/pidx/src/main.rs]
        SCAN[Scan sessions-dir<br/>key files by size + mtime_ns]
        PARSE[Parse JSONL → extract<br/>turns, calls, results,<br/>compactions, skills]
        STORE[State store<br/>byte-range header + raw extract bytes]
        OUT[Write one JSON line per session<br/>newest first → --out; summary → stderr]
    end

    REG --> SCAN
    SCAN -->|file changed?| PARSE
    SCAN -->|unchanged| STORE
    PARSE --> STORE
    STORE -->|replay cached extract| OUT
    PARSE --> OUT
```

Incremental contract: files keyed by `(size, mtime_ns)`; unchanged files replay
the cached extract without re-parsing or re-serializing. Warm runs are
O(changes), not O(archive). Exit 0 even with individually unparseable files
(they yield an extract with zero turns). The `PARITY:` notes inline pin
behaviour against the Node parser (`tsMs`, `ACTIVE_SESSION_MS`,
`IMAGE_BYTES_ESTIMATE`).
