import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "sec-edgar";
const UPSTREAM = "https://data.sec.gov";
const TIER = "premium" as const;

/** Mirrors sources/sec-edgar/source.json → auth (type none; injector no-ops). */
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

/**
 * SEC mandates a descriptive User-Agent (AppName contact@email) on every
 * request to data.sec.gov or it returns 403. This is a courtesy header, NOT a
 * credential — hardcoded here, overridable via SEC_USER_AGENT.
 */
const USER_AGENT =
  process.env.SEC_USER_AGENT ?? "GovData-MCP admin@govdata-mcp.vercel.app";

const DESCRIPTION = `Raw passthrough to SEC EDGAR (data.sec.gov): U.S. public-company filings and XBRL financial facts. No API key, but the gateway injects a mandatory User-Agent. JSON returned verbatim.

ENDPOINT PATTERNS
- GET /submissions/CIK{cik}.json
    All filings for a company. {cik} is zero-padded to 10 digits (e.g. CIK0000320193 = Apple). Response .filings.recent has parallel arrays (form, filingDate, accessionNumber, primaryDocument).
- GET /api/xbrl/companyconcept/CIK{cik}/{taxonomy}/{tag}.json
    One XBRL fact across all filings. taxonomy is usually "us-gaap"; tag e.g. "Revenues", "Assets". Response .units keyed by unit (e.g. "USD") -> array of period values.
- GET /api/xbrl/companyfacts/CIK{cik}.json
    Every XBRL fact for a company (large payload).

PARAMETER FORMAT
- CIK MUST be zero-padded to 10 digits in the path: 320193 -> "CIK0000320193".
- All endpoints are GET; no body, no query params.
- Taxonomy/tag are case-sensitive (us-gaap, Revenues).

EXAMPLE QUERIES
1. All filings for Apple (CIK 320193):
   method "GET", path "/submissions/CIK0000320193.json"
2. Apple annual revenue (us-gaap Revenues):
   method "GET", path "/api/xbrl/companyconcept/CIK0000320193/us-gaap/Revenues.json"

COMMON ERRORS
- 403: missing/blank User-Agent (the gateway sets one automatically; if you still see 403 the upstream is rate-limiting — back off, max ~10 req/s per IP).
- 404 on /submissions: CIK not zero-padded to 10 digits, or company has no EDGAR presence.
- Full-text search (efts.sec.gov) is a DIFFERENT host and is not reachable through this connector — use the CIK-based endpoints above.`;

export const secEdgarConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "SEC EDGAR — Filings & XBRL Facts (U.S. SEC)",
      tier: TIER,
      upstreamBaseUrl: UPSTREAM,
      description: DESCRIPTION,
    };
  },

  async execute(rawQuery: RawQuery): Promise<ExecuteResult> {
    const method = rawQuery.method ?? "GET";
    const url = new URL(rawQuery.path.replace(/^\//, ""), `${UPSTREAM}/`);
    applyParams(url, rawQuery.params);

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...(rawQuery.body ? { "Content-Type": "application/json" } : {}),
    };
    injectAuth(AUTH, { url, headers });

    const res = await fetch(url, {
      method,
      headers,
      ...(rawQuery.body ? { body: JSON.stringify(rawQuery.body) } : {}),
    });

    const contentType = res.headers.get("content-type") ?? undefined;
    const data: unknown = contentType?.includes("json")
      ? await res.json()
      : await res.text();

    return { status: res.status, data, contentType };
  },
};
