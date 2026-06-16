import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "epa-airnow";
const UPSTREAM = "https://www.airnowapi.org";

/** Mirrors sources/epa-airnow/source.json → auth (api-key, query "API_KEY"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "query",
  paramName: "API_KEY",
  credentialRef: "env:AIRNOW_API_KEY",
  signupUrl: "https://docs.airnowapi.org/account/request/",
};

const DESCRIPTION = `Raw passthrough to EPA AirNow (www.airnowapi.org): real-time and forecast U.S. air quality (AQI). Requires a free API_KEY (injected automatically). JSON returned verbatim WHEN you request it.

ENDPOINT PATTERNS
- GET /aq/observation/zipCode/current/
    Current AQI by ZIP. Params: format, zipCode, distance (miles).
- GET /aq/observation/latLong/current/
    Current AQI by coordinate. Params: format, latitude, longitude, distance.
- GET /aq/forecast/zipCode/  and  /aq/forecast/latLong/
    AQI forecast. Params add date ("YYYY-MM-DD").
- GET /aq/data/
    Raw monitor data over a bounding box + time range (BBOX, parameters, startDate, endDate).

PARAMETER FORMAT
- format is a QUERY VALUE, literally "application/json" (NOT an Accept header).
- zipCode: 5-digit string. latitude/longitude: decimal degrees.
- distance: search radius in miles (e.g. 25).
- The gateway appends API_KEY automatically — do not add it.

EXAMPLE QUERIES
1. Current AQI for ZIP 90210 (25-mile radius):
   method "GET", path "/aq/observation/zipCode/current/", params {"format":"application/json","zipCode":"90210","distance":"25"}
2. AQI forecast by lat/lon for a date:
   method "GET", path "/aq/forecast/latLong/", params {"format":"application/json","latitude":"34.09","longitude":"-118.41","date":"2026-06-11"}

COMMON ERRORS
- "credential not configured": AIRNOW_API_KEY is unset on the gateway.
- Empty array []: no monitoring station within "distance" — a coverage gap, not an error. Widen distance.
- Plain text instead of JSON: format param missing or not exactly "application/json".
- Hourly rate limit (~500/hr per key) is enforced; cache aggressively.`;

export const epaAirnowConnector: Connector = {
  id: ID,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Air Quality (EPA AirNow)",
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
