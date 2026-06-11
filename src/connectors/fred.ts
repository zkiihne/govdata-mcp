import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";

const ID = "fred";
const UPSTREAM = "https://api.stlouisfed.org/fred";
const TIER = "free" as const;

/** Mirrors sources/fred/source.json → auth (api-key, query "api_key"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "query",
  paramName: "api_key",
  credentialRef: "env:FRED_API_KEY",
  signupUrl: "https://fredaccount.stlouisfed.org/apikeys",
};

const DESCRIPTION = `Raw passthrough to FRED — Federal Reserve Economic Data (api.stlouisfed.org/fred). Requires a free api_key (injected automatically). JSON returned verbatim WHEN you request it.

ENDPOINT PATTERNS
- GET /series/observations?series_id={id}&file_type=json
    Observation values for one series. Response .observations[] = {date, value}.
- GET /series/search?search_text={text}&file_type=json
    Discover series_ids by text. Response .seriess[] = matching series.

PARAMETER FORMAT
- series_id: case-sensitive uppercase code (GDP, CPIAUCSL, UNRATE, FEDFUNDS).
- file_type=json is MANDATORY — omit it and FRED returns XML.
- Optional: observation_start / observation_end as "YYYY-MM-DD".

EXAMPLE QUERIES
1. Monthly CPI (all urban consumers):
   method "GET", path "/series/observations", params {"series_id":"CPIAUCSL","file_type":"json"}
2. Find unemployment-related series:
   method "GET", path "/series/search", params {"search_text":"unemployment rate","file_type":"json"}

COMMON ERRORS
- XML instead of JSON: you forgot file_type=json.
- "credential not configured": FRED_API_KEY is unset on the gateway.
- 400 "Bad Request. The series does not exist": wrong/lowercased series_id (codes are uppercase, case-sensitive).
- Rate limit 120 req/min per key.`;

export const fredConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Economic Data (FRED / St. Louis Fed)",
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
