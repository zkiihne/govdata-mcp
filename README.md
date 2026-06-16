# govdata-mcp

An [MCP](https://modelcontextprotocol.io) gateway that gives AI agents access to
U.S. government and public-data APIs through **one** proxy. Discover sources,
then query them with **raw passthrough** — whatever the upstream API returns is
forwarded verbatim, no normalization. Tool descriptions are LLM-optimized so an
agent learns to drive each upstream API inline.

> Live: stdio transport for local use **and** a remote Streamable HTTP endpoint
> deployed on Vercel. Discovery + the NOAA free connector are queryable now.

**Website:** <https://govdata-mcp.vercel.app> — landing page, live source
[catalog](https://govdata-mcp.vercel.app/catalog.html), and the public catalog
API at [`/api/catalog`](https://govdata-mcp.vercel.app/api/catalog) (the catalog
page renders from this endpoint, so it stays in sync with `sources/`).

## Remote endpoint (hosted)

The gateway is deployed as a remote MCP server over Streamable HTTP:

```
https://govdata-mcp.vercel.app/api/mcp
```

Everything is free. Discovery and every keyless connector work immediately;
keyed connectors are bring-your-own-key — set the API key env var and they go
live (until then they return a `503` with a link to get a free key). Call the
`auth_status` tool to see which keys are set and which are missing.

### Add it to Claude Desktop

Claude Desktop speaks stdio, so bridge to the remote endpoint with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote). In
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "govdata": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://govdata-mcp.vercel.app/api/mcp"]
    }
  }
}
```

### Add it to Cursor

Cursor supports remote Streamable HTTP servers directly. In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "govdata": {
      "url": "https://govdata-mcp.vercel.app/api/mcp"
    }
  }
}
```

Any MCP client that supports Streamable HTTP can connect to the URL directly.

## Everything is free · bring-your-own-key

There is no payment model. Two kinds of sources:

| Access | What | Setup |
| --- | --- | --- |
| **Keyless** | Raw-passthrough connectors over APIs that need no key (NOAA, USAspending, SEC EDGAR, FEMA, …). | None — query immediately. |
| **BYOK (bring-your-own-key)** | Connectors over gov APIs that require a free API key (BLS, FRED, Census, Congress.gov, …). | Set the API key env var (e.g. `FRED_API_KEY`). The key is read from your environment; the gateway ships none. Until set, queries return `503`. |

Every required key is free and listed by the `auth_status` tool, with the exact
env var and a signup link.

## Design principles

1. **Raw passthrough** — connectors forward queries to the upstream API verbatim and return the unmodified response. No field renaming or reshaping.
2. **LLM-optimized docs** — each tool description teaches an agent the endpoint patterns, parameter formats, examples, and common errors. See [`docs/llm-doc-style-guide.md`](docs/llm-doc-style-guide.md). This extends to provisioning: keyed sources document the env var and signup URL inline.
3. **Bring-your-own-key** — the gateway holds no master keys. Keyed sources read a free API key from the environment per their `auth` block, so the user owns the quota and the ToS.

## Tools

1. `discover_data_sources` — free; returns the catalog (`src/data/catalog.ts`).
2. `auth_status` — free; reports which keyed sources need a BYOK key, which env var to set, whether it's set, and where to get one.
3. `query_data_source` — takes `{ connectorId, path, params?, method?, body? }`, routes by status. Unknown id → 404; planned (no connector) → 501; missing BYOK key → 503; implemented → upstream passthrough.

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
  router.ts             routes connectorId → connector by status (404/501/503)
  tools/discovery.ts    free discovery tool
  tools/auth-status.ts  free BYOK key-status tool
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
.env.example            BYOK API key placeholders (set your own)
```

## Adding a connector

1. Copy `src/connectors/_template.ts` to `src/connectors/<id>.ts`, fill the TODOs.
2. Add a matching entry to `src/data/catalog.ts` (`connectorImplemented: true`).
3. Register it in the `CONNECTORS` map in `src/router.ts`.
4. Write its description per `docs/llm-doc-style-guide.md`.

## Configuration

Copy `.env.example` to `.env` and set keys for whichever keyed sources you want
to use (all free — see `auth_status` for signup links). Keyless sources need
nothing. The gateway reads keys from the environment and ships none of its own.
