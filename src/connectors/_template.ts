/**
 * Connector template — the "factory" pattern for onboarding a new data source.
 *
 * To add a source:
 *   1. Copy this file to src/connectors/<id>.ts
 *   2. Replace every TODO below.
 *   3. Add a matching entry to src/data/catalog.ts (set connectorImplemented: true).
 *   4. Register the connector in src/router.ts (the CONNECTORS map).
 *   5. Write the description following docs/llm-doc-style-guide.md.
 *
 * Principle: RAW PASSTHROUGH. execute() forwards the query to the upstream API
 * verbatim and returns the unmodified response. Do not normalize, rename, or
 * reshape fields — the agent reads the upstream schema directly via the docs.
 */
import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
  Tier,
} from "./types.js";

// TODO: upstream API base URL.
const UPSTREAM = "https://api.example.gov";

// TODO: "free" for Tier 1.5 unmetered, "premium" for Tier 2 (HTTP-402 gated).
const TIER: Tier = "free";

// TODO: if this source needs a server-held key, read it here.
// const API_KEY = process.env.EXAMPLE_API_KEY;

// TODO: write an LLM-optimized description. Cover endpoint patterns, parameter
// formats, 1-2 example queries, and common errors. See the style guide.
const DESCRIPTION = `TODO: describe how an agent drives this upstream API.

ENDPOINT PATTERNS
- GET /TODO

PARAMETER FORMAT
- TODO

EXAMPLE QUERIES
1. TODO

COMMON ERRORS
- TODO`;

export const templateConnector: Connector = {
  // TODO: stable id, must match the catalog entry id.
  id: "template",
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: "template",
      name: "TODO Human/LLM-facing name",
      tier: TIER,
      upstreamBaseUrl: UPSTREAM,
      description: DESCRIPTION,
    };
  },

  async execute(rawQuery: RawQuery): Promise<ExecuteResult> {
    const method = rawQuery.method ?? "GET";
    const url = new URL(rawQuery.path.replace(/^\//, ""), `${UPSTREAM}/`);
    if (rawQuery.params) {
      for (const [k, v] of Object.entries(rawQuery.params)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        // TODO: add auth header / User-Agent if the upstream requires it.
        // Authorization: `Bearer ${API_KEY}`,
        ...(rawQuery.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(rawQuery.body ? { body: JSON.stringify(rawQuery.body) } : {}),
    });

    const contentType = res.headers.get("content-type") ?? undefined;
    const data: unknown = contentType?.includes("json")
      ? await res.json()
      : await res.text();

    return { status: res.status, data, contentType };
  },
};
