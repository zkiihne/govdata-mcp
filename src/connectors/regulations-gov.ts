import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "regulations-gov";
const UPSTREAM = "https://api.regulations.gov/v4";
const TIER = "premium" as const;

/** Mirrors sources/regulations-gov/source.json → auth (api-key, header "X-Api-Key"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "header",
  paramName: "X-Api-Key",
  credentialRef: "env:REGULATIONS_API_KEY",
  signupUrl: "https://open.gsa.gov/api/regulationsgov/#getting-started",
};

const DESCRIPTION = `Raw passthrough to the Regulations.gov API v4 (api.regulations.gov/v4). US federal rulemaking: regulatory documents, dockets, and public comments. Premium (Tier 2) — the gateway returns 402 until metering is enabled. The X-Api-Key header is injected by the gateway.

ENDPOINT PATTERNS
- GET /documents — search rules, proposed rules, notices, supporting materials.
- GET /dockets — search rulemaking dockets.
- GET /comments — search public comments. Detail by id at /documents/{id}, etc.

PARAMETER FORMAT
- Bracketed filters and paging: filter[searchTerm], filter[agencyId],
  filter[postedDate][ge], sort, page[size] (max 250), page[number].

EXAMPLE QUERIES
1. Search documents by term for an agency:
   method "GET", path "/documents", params {"filter[searchTerm]":"emissions","filter[agencyId]":"EPA","page[size]":"5"}
2. Comments posted after a date:
   method "GET", path "/comments", params {"filter[postedDate][ge]":"2024-01-01","page[size]":"10"}

COMMON ERRORS
- 402: premium gating — metering not yet enabled.
- 400 "page size must be 5 or greater": page[size] minimum is 5 (max 250).
- 429: 1000 req/hr per key. Results cap at 5000/query — narrow with date/agency filters.`;

export const regulationsGovConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Federal Rulemaking (Regulations.gov)",
      tier: TIER,
      upstreamBaseUrl: UPSTREAM,
      description: DESCRIPTION,
    };
  },

  async execute(rawQuery: RawQuery): Promise<ExecuteResult> {
    const method = rawQuery.method ?? "GET";
    const url = new URL(rawQuery.path.replace(/^\//, ""), `${UPSTREAM}/`);
    applyParams(url, rawQuery.params);

    const headers: Record<string, string> = { Accept: "application/json" };
    injectAuth(AUTH, { url, headers });

    const res = await fetch(url, { method, headers });

    const contentType = res.headers.get("content-type") ?? undefined;
    const data: unknown = contentType?.includes("json")
      ? await res.json()
      : await res.text();

    return { status: res.status, data, contentType };
  },
};
