/**
 * Connector template — Phase 3 of the onboarding workflow (docs/onboarding.md).
 *
 * Prereqs: the source already has a validated sources/<id>/source.json
 * (Phase 2) and its credential (if any) is stored as a Vercel env var per
 * auth.credentialRef. To wire the connector:
 *   1. Copy this file to meta.connectorPath, e.g. src/connectors/<id>.ts
 *   2. Set ID to the source id, UPSTREAM to api.baseUrl.
 *   3. Paste the source's `auth` block into AUTH below.
 *   4. Register the connector in src/router.ts (the CONNECTORS map).
 *   5. Set status: "testing" in source.json, run `npm run catalog`.
 *   6. Fill llmDocs (Phase 4) and ship (Phase 5).
 *
 * Principle: RAW PASSTHROUGH. execute() forwards the query to the upstream API
 * verbatim and returns the unmodified response. Do not normalize, rename, or
 * reshape fields. Credentials are handled ONLY by injectAuth() — never hand-code
 * an Authorization header or key param here.
 */
import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
  Tier,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

// TODO: stable id, must match the sources/<id>/ folder and source.json id.
const ID = "template";

// TODO: upstream API base URL (= api.baseUrl in source.json).
const UPSTREAM = "https://api.example.gov";

// TODO: "free" for Tier 1.5 unmetered, "premium" for Tier 2 (HTTP-402 gated).
const TIER: Tier = "free";

// TODO: paste the `auth` block from source.json verbatim. The injector resolves
// credentialRef (env:VAR) and places it per placement/paramName. `none` no-ops.
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

// TODO: write an LLM-optimized description. Cover endpoint patterns, parameter
// formats, 1-2 example queries, and common errors. See the style guide. (This is
// surfaced in the query tool; the structured llmDocs live in source.json.)
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
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "TODO Human/LLM-facing name",
      tier: TIER,
      upstreamBaseUrl: UPSTREAM,
      description: DESCRIPTION,
    };
  },

  async execute(rawQuery: RawQuery): Promise<ExecuteResult> {
    const method = rawQuery.method ?? "GET";
    const url = new URL(rawQuery.path.replace(/^\//, ""), `${UPSTREAM}/`);
    applyParams(url, rawQuery.params);

    // Mutable request parts the injector may write into (query/header/body).
    const headers: Record<string, string> = { Accept: "application/json" };
    const body: Record<string, unknown> | undefined =
      rawQuery.body && typeof rawQuery.body === "object"
        ? { ...(rawQuery.body as Record<string, unknown>) }
        : rawQuery.body !== undefined
          ? (rawQuery.body as Record<string, unknown>)
          : undefined;

    // Generic credential injection — the ONLY place auth is applied.
    injectAuth(AUTH, { url, headers, body });

    const hasBody = body !== undefined;
    if (hasBody) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });

    const contentType = res.headers.get("content-type") ?? undefined;
    const data: unknown = contentType?.includes("json")
      ? await res.json()
      : await res.text();

    return { status: res.status, data, contentType };
  },
};
