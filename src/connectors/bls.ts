import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";

const ID = "bls-public-data";
const UPSTREAM = "https://api.bls.gov/publicAPI/v2";
const TIER = "free" as const;

/** Mirrors sources/bls-public-data/source.json → auth (api-key, body "registrationkey"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "body",
  paramName: "registrationkey",
  credentialRef: "env:BLS_API_KEY",
  signupUrl: "https://data.bls.gov/registrationEngine/",
};

const DESCRIPTION = `Raw passthrough to the Bureau of Labor Statistics Public Data API v2 (api.bls.gov/publicAPI/v2). Requires a free registration key (injected into the POST body automatically). JSON returned verbatim.

ENDPOINT PATTERNS
- POST /timeseries/data/
    Fetch one or more series over a year range. Body: {"seriesid":[...],"startyear":"YYYY","endyear":"YYYY"}. The gateway adds "registrationkey". Response .Results.series[].data[] are observations.

PARAMETER FORMAT
- seriesid: array of structured series codes. Prefix = survey: LN=national unemployment (LNS14000000 = unemployment rate), CU=CPI urban (CUUR0000SA0), CE=employment.
- startyear/endyear: STRINGS, not ints ("2024"), max 20-year span per request.
- Always POST with a JSON body; there is no useful GET form for multi-series.

EXAMPLE QUERIES
1. National unemployment rate, 2024-2026:
   method "POST", path "/timeseries/data/", body {"seriesid":["LNS14000000"],"startyear":"2024","endyear":"2026"}
2. CPI (all urban consumers, all items), 2024-2026:
   method "POST", path "/timeseries/data/", body {"seriesid":["CUUR0000SA0"],"startyear":"2024","endyear":"2026"}

COMMON ERRORS
- "credential not configured": BLS_API_KEY is unset on the gateway — v2 rejects keyless multi-series requests.
- 405 / REQUEST_NOT_PROCESSED: sent GET instead of POST, or years passed as ints not strings.
- Daily quota is 500 requests/key; quota is shared across all gateway callers.`;

export const blsConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Labor Statistics (BLS Public Data v2)",
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
    // BLS auth places the key in the JSON body, so a body object must exist.
    const body: Record<string, unknown> =
      rawQuery.body && typeof rawQuery.body === "object"
        ? { ...(rawQuery.body as Record<string, unknown>) }
        : {};

    injectAuth(AUTH, { url, headers, body });
    headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    });

    const contentType = res.headers.get("content-type") ?? undefined;
    const data: unknown = contentType?.includes("json")
      ? await res.json()
      : await res.text();

    return { status: res.status, data, contentType };
  },
};
