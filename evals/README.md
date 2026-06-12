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

## Run

```bash
npm run eval                 # all cases in evals/cases/*.json
npm run eval -- --selftest   # plumbing check only (no eval, ~1 API call)
npm run eval -- --source=usgs-earthquake   # sourceId match OR case-id prefix
npm run eval -- --limit=5
npm run eval -- --case=some-case-id
```

Output lands in `evals/results/<timestamp>/`:

- `results.json` — `[{ case, transcript, grade }]`
- `summary.md` — overall pass rate, per-source table, failure-category counts,
  and a ranked "worst llmDocs offenders" list (lowest pass rate first).

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
