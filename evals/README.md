# Agent-blind eval harness

Measures whether a **fresh, blind agent** — given only the two production MCP
tools and **no GovData documentation in its system prompt** — can discover a
source, build a correct native query, and read usable data back.

A high failure rate for a given source is a signal that its `llmDocs` need work:
the descriptions aren't carrying enough for an undocumented agent to succeed.

## How it works

1. `tools/list` is fetched from **live prod** (`https://govdata-mcp.vercel.app/api/mcp`)
   so the agent sees the **exact production tool descriptions** — no hardcoding.
2. Each case spins up a fresh conversation. System prompt = Claude Code identity
   preamble + a generic data-retrieval prompt (zero GovData knowledge).
3. The agent runs up to **6 tool-call rounds**, executing every tool call against
   live prod, until it returns a final text answer.
4. A separate **grader** call inspects the full transcript (tool args + raw
   responses, not just prose) and returns a strict structured verdict.

## Run (incremental)

The runner is **incremental and crash-safe**: each case's full result is written
to `evals/results/<run-id>/cases/<case-id>.json` the instant it finishes (with a
`<case-id>.pending` marker while in-flight), so a crash mid-run loses at most the
one in-flight case. Cases are split into **per-source batches** and run
sequentially. The scoreboard is a **separate collect step** (below).

```bash
npm run eval                 # all cases, all per-source batches, sequentially
npm run eval -- --selftest   # plumbing check only (no eval, ~1 API call)
npm run eval -- --list-batches             # print the batch plan, no API calls
npm run eval -- --source=usgs-earthquake   # one source (sourceId match OR id prefix)
npm run eval -- --batch=3                   # the nth per-source batch (1-based)
npm run eval -- --case=some-case-id         # a single case
npm run eval -- --limit=5
```

Each run prints its **run id** (a timestamp by default). To run into a specific
dir or resume:

```bash
npm run eval -- --run-id=my-run            # write into results/my-run/
npm run eval -- --resume my-run            # reuse results/my-run/, SKIP cases
                                           # that already have a result file
```

`--resume` makes a full run restartable for free: re-launch the same command (or
launch remaining batches one at a time) and already-completed cases are skipped
with zero API calls.

## Collect (scoreboard)

Collection is a **separate, idempotent step** that reads the per-case files and
emits the scoreboard. It works on **partial** runs — any case without a result
file yet is listed under "Not run" instead of skewing the pass rate.

```bash
npm run eval:collect -- <run-id>
```

This writes into `evals/results/<run-id>/`:

- `results.json` — `[{ case, transcript, grade }]` (all per-case files merged)
- `summary.md` — overall pass rate, per-source table, failure-category counts,
  a ranked "worst llmDocs offenders" list (lowest pass rate first), and a
  "Not run" section when the run is incomplete.

Re-running collect after more cases finish simply refreshes both files.

### Typical full sweep

```bash
npm run eval -- --run-id=sweep-1     # runs all 41 cases, per-case files land live
npm run eval -- --resume sweep-1     # (if interrupted) finish the rest, skips done
npm run eval:collect -- sweep-1      # build the scoreboard
```

## Auth & cost

- **No Anthropic API key is used.** The harness reads the Claude Code OAuth
  subscription token from the macOS keychain at runtime
  (`security find-generic-password -s "Claude Code-credentials"`), so runs draw
  on your Claude subscription, not pay-per-token API billing.
- Model for both agent and grader: `claude-sonnet-4-6`.
- Cost per case ≈ up to 6 agent turns + 1 grader call. Use `--limit` / `--source`
  for cheap pilot subsets before a full sweep.

## Adding cases

Cases live in `evals/cases/*.json` (authored separately). Each file is a JSON
array of case objects:

```json
[
  {
    "id": "usgs-earthquake-recent",
    "sourceId": "usgs-earthquake",
    "intent": "How many magnitude 4.5+ earthquakes happened in the last day?",
    "successCriteria": "Final answer gives a specific count grounded in the USGS feed.",
    "difficulty": "easy"
  }
]
```

All files are loaded and flattened. For cross-source routing cases (e.g.
`_routing.json`), `sourceId` is the single correct source the agent should pick.
