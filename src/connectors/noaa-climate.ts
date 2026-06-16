import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "noaa-climate";
const UPSTREAM = "https://www.ncei.noaa.gov/cdo-web/api/v2";

/** Mirrors sources/noaa-climate/source.json → auth (api-key, header "token"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "header",
  paramName: "token",
  credentialRef: "env:NOAA_CDO_TOKEN",
  signupUrl: "https://www.ncdc.noaa.gov/cdo-web/token",
};

const DESCRIPTION = `Raw passthrough to NOAA Climate Data Online v2 (www.ncei.noaa.gov/cdo-web/api/v2): historical/archival U.S. climate records. Requires a free token (injected as the "token" HTTP header automatically). This is the HISTORICAL archive — distinct from the keyless real-time forecasts in "noaa-weather". JSON returned verbatim.

ENDPOINT PATTERNS
- GET /data?datasetid={id}&stationid={id}&startdate={d}&enddate={d}
    Observations. Response .results[] = {date, datatype, station, value}.
- GET /stations
    List/lookup stations (filter by datasetid, locationid, extent).
- GET /datasets
    Available datasets (GHCND = daily summaries, GSOM = monthly).

PARAMETER FORMAT
- datasetid: e.g. "GHCND" (daily) or "GSOM" (monthly).
- stationid: fully-qualified, e.g. "GHCND:USW00023174".
- startdate/enddate: "YYYY-MM-DD". For daily data the range must be <= 1 year per request.
- The token goes in an HTTP header (the gateway injects it) — never a query param.

EXAMPLE QUERIES
1. Daily summaries for one station, January 2026:
   method "GET", path "/data", params {"datasetid":"GHCND","stationid":"GHCND:USW00023174","startdate":"2026-01-01","enddate":"2026-01-31"}
2. List available datasets:
   method "GET", path "/datasets"

COMMON ERRORS
- "credential not configured": NOAA_CDO_TOKEN is unset on the gateway.
- 400 / empty results: date range exceeds 1 year for daily data, or stationid lacks its dataset prefix (GHCND:...).
- 429: exceeded 5 req/s or 10,000 req/day per token.
- Do not confuse with noaa-weather (real-time forecasts, keyless, api.weather.gov).`;

export const noaaClimateConnector: Connector = {
  id: ID,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Historical Climate (NOAA CDO v2 / NCEI)",
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
