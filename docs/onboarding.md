# Source onboarding workflow

How a data source goes from an idea to a live connector. Every source is defined
by one file — `sources/<id>/source.json` — validated against
[`src/catalog/schema.ts`](../src/catalog/schema.ts). The runtime catalog is
**generated** from these files (`npm run catalog` → `src/catalog/catalog.generated.ts`),
so the gateway ships the validated specs compiled into its bundle.

Work the five phases in order. Each phase has a gate; do not skip ahead.

---

## Phase 1 — Vet

Decide whether we should carry the source at all, and at what tier.

1. Read the upstream Terms of Service. Fill `compliance.license`,
   `compliance.tosUrl`, `compliance.redistributionNotes`.
2. Check the access model: does it need a key? per-IP or per-key quotas? Fill
   `limits` (`dailyQuota`, `perRequestMaxSeries`, `rateLimitBehavior`, `notes`).
3. Tier decision, driven by `limits` + `pricing`:
   - **free** — keyless or free-key, generous quota, redistributable → Tier 1.5.
   - **premium** — metered cost, restrictive ToS, or we add value worth gating →
     Tier 2 (returns HTTP 402 until billing is enabled). Set `pricing.model` and
     `pricing.feePerCallCents`.
4. **GATE:** the source may not advance to `status: live`/`degraded` until
   `compliance.reviewedDate` is set (the schema enforces this). Leave it `null`
   while planned; set it the day a human signs off on the ToS.

## Phase 2 — Catalog

Register the source as a directory listing (no connector yet).

1. Create `sources/<id>/source.json` with `status: "planned"`. `<id>` must be
   kebab-case and **match the folder name**. Optionally add
   `sources/<id>/notes.md` for working notes.
2. Fill `api` (`baseUrl`, `protocol`, `docsUrl`, `endpoints[]`), `agency`,
   `category`, and the `auth` block (see below).
3. If the source needs a credential, store it as a Vercel env var named per
   `auth.credentialRef` (e.g. `credentialRef: "env:FRED_API_KEY"` →
   `vercel env add FRED_API_KEY`), and add the var to `.env.example` for local dev.
4. Run `npm run validate` then `npm run catalog`. Commit the regenerated
   `catalog.generated.ts`. The source now appears in discovery as a roadmap entry;
   querying it returns 501 (free) until a connector ships.

**Auth block** (`auth`): set `type` (`none` | `api-key` | `oauth`). For anything
other than `none`, set `placement` (`query` | `header` | `body`), `paramName`
(the literal param/header key the upstream expects), and `credentialRef`
(`env:VAR_NAME`). The generic injector reads exactly these fields — no auth is
hand-coded in connectors.

## Phase 3 — Connector

Wire raw passthrough.

1. Copy `src/connectors/_template.ts` to `meta.connectorPath`
   (e.g. `src/connectors/fred.ts`).
2. Set `ID` to match the source id, paste the source's `auth` block into the
   `AUTH` const, and set `UPSTREAM` to `api.baseUrl`.
3. `execute()` forwards the query verbatim and returns the unmodified response.
   It calls `injectAuth(AUTH, { url, headers, body })` — do **not** hand-code
   credential handling. Do not normalize, rename, or reshape upstream fields.
4. Register the connector in `src/router.ts` (the `CONNECTORS` map).
5. Set `status: "testing"`, regenerate the catalog.

## Phase 4 — LLM docs

Teach the agent how to drive the upstream API. Fill `llmDocs` per
[`docs/llm-doc-style-guide.md`](./llm-doc-style-guide.md):

1. `summary` — one line: what data, what granularity.
2. `queryGuide` — how to construct a query: id/code formats, required params,
   the request flow (e.g. two-step geocode → forecast).
3. `exampleQueries` — **at least 2**, each an `intent` → literal raw `request`
   payload the agent can adapt verbatim (path + params/body, not prose).
4. `gotchas` — the traps: POST-vs-GET, string-vs-int params, mandatory headers,
   coverage gaps, pagination.

Regenerate the catalog so the docs reach discovery.

## Phase 5 — Ship

1. Local stdio smoke test: `npm run smoke`. Confirm the source appears in
   discovery and a live query returns real upstream data.
2. Deploy: `vercel --prod` (or push to the connected branch).
3. Verify on prod against `https://govdata-mcp.vercel.app/api/mcp`: discovery
   lists the source and a real query passes through.
4. Set `status: "live"` and `meta.lastTestedDate` to today, confirm
   `compliance.reviewedDate` is set (Phase 1 gate), regenerate the catalog,
   commit, and redeploy.

---

## Quick reference

| Action | Command |
| --- | --- |
| Validate every source.json | `npm run validate` |
| Regenerate runtime catalog | `npm run catalog` |
| Local smoke test | `npm run smoke` |
| Typecheck | `npm run typecheck` |

A planned source is just a `source.json` with `status: "planned"` and no
connector. It costs nothing to list and signals the roadmap to agents — the
discovery tool returns it, the router returns 501 if queried.
