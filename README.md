# govdata-mcp

An [MCP](https://modelcontextprotocol.io) gateway that gives AI agents access to
U.S. government and public-data APIs through **one** proxy. Discover sources,
then query them with **raw passthrough** — whatever the upstream API returns is
forwarded verbatim, no normalization. Tool descriptions are LLM-optimized so an
agent learns to drive each upstream API inline.

> Phase 0 scaffold: stdio transport, discovery tool, and the first live free
> connector (NOAA). Not deployed.

## The three tiers

| Tier | What | Status |
| --- | --- | --- |
| **Tier 1 — Discovery** | Free `discover_data_sources` tool: a directory of every category, its tier, upstream base URL, schema notes, and an example native query. | ✅ live |
| **Tier 1.5 — Free connectors** | Unmetered raw-passthrough connectors: NOAA (live), Census, BLS. No payment. | NOAA live; others catalogued |
| **Tier 2 — Premium connectors** | HTTP-402-gated connectors: SEC EDGAR, property records. Server-held credentials, metered. | stubbed 402 |

## Design principles

1. **Raw passthrough** — connectors forward queries to the upstream API verbatim and return the unmodified response. No field renaming or reshaping.
2. **LLM-optimized docs** — each tool description teaches an agent the endpoint patterns, parameter formats, examples, and common errors. See [`docs/llm-doc-style-guide.md`](docs/llm-doc-style-guide.md).
3. **Server-held credentials** — master API keys live on the server (`.env`), never exposed to the calling agent.

## Tools

1. `discover_data_sources` — free; returns the catalog (`src/data/catalog.ts`).
2. `query_data_source` — takes `{ connectorId, path, params?, method?, body? }`, routes by tier. Premium → 402 stub; unknown id → 404; free + implemented → upstream passthrough.

## Run locally

Requires Node 20+.

```bash
npm install

# Dev (no build step, via tsx):
npm run dev

# Or build + run:
npm run build && npm start
```

### Inspect with the MCP Inspector

```bash
npm run inspect
# launches @modelcontextprotocol/inspector against `tsx src/index.ts`
```

In the Inspector: **List Tools** → call `discover_data_sources` (no args), then
call `query_data_source` with:

```json
{ "connectorId": "noaa", "path": "/points/39.7456,-104.9903" }
```

Read `.properties.forecast` from the result, then query that gridpoint path for
the forecast periods.

### Minimal client check

```bash
npx tsx scripts/smoke.ts
```

Spawns the server over stdio, lists tools, calls discovery, and runs a live NOAA
query — prints the raw results.

## Project layout

```
src/
  index.ts              MCP server entry; tool registration + dispatch
  router.ts             routes connectorId → connector by tier (402/404/501 stubs)
  tools/discovery.ts    Tier 1 free discovery tool
  data/catalog.ts       hardcoded source directory (edit here to add a category)
  connectors/
    types.ts            Connector interface + RawQuery/ExecuteResult
    noaa.ts             first live free connector (api.weather.gov)
    _template.ts        copyable connector template (factory pattern)
  transport/
    stdio.ts            stdio wiring (HTTP/Vercel transport added later here)
docs/
  llm-doc-style-guide.md   how to write agent-readable tool descriptions
scripts/
  smoke.ts              minimal stdio client smoke test
.env.example            master credential placeholders (server-held)
```

## Adding a connector

1. Copy `src/connectors/_template.ts` to `src/connectors/<id>.ts`, fill the TODOs.
2. Add a matching entry to `src/data/catalog.ts` (`connectorImplemented: true`).
3. Register it in the `CONNECTORS` map in `src/router.ts`.
4. Write its description per `docs/llm-doc-style-guide.md`.

## Configuration

Copy `.env.example` to `.env`. Tier 1.5 keys (Census, BLS) and Tier 2 secrets are
read server-side; agents never see them.
