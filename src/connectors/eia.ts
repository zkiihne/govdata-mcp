import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";

const ID = "eia";
const UPSTREAM = "https://api.eia.gov/v2";
const TIER = "free" as const;

/** Mirrors sources/eia/source.json → auth (api-key, query "api_key"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "query",
  paramName: "api_key",
  credentialRef: "env:EIA_API_KEY",
  signupUrl: "https://www.eia.gov/opendata/register.php",
};

const DESCRIPTION = `Raw passthrough to the EIA Energy Data API v2 (api.eia.gov/v2). US energy statistics: electricity prices and generation, petroleum, natural gas, coal, renewables, CO2 emissions, and international energy. Requires a free key (injected as api_key).

ENDPOINT PATTERNS
- GET /{route} — browse the route tree: child routes, frequencies, facets, data columns.
- GET /{route}/data — time-series rows for a route.

PARAMETER FORMAT
- Two-step: GET a route (e.g. /electricity/retail-sales) to learn valid data[] columns
  and facet ids BEFORE requesting /data.
- Bracketed array params: data[]=price, facets[stateid][]=CA.
- Also: frequency=, start=, end=, sort[0][column]=&sort[0][direction]=, offset, length (max 5000).

EXAMPLE QUERIES
1. Browse the electricity retail-sales route metadata:
   method "GET", path "/electricity/retail-sales"
2. Monthly average retail electricity price, all sectors:
   method "GET", path "/electricity/retail-sales/data", params {"frequency":"monthly","data[]":"price","start":"2023-01","length":"12"}

COMMON ERRORS
- Empty/blank response: you queried /data without valid data[] columns — read the route metadata first.
- length capped at 5000 rows — page with offset.
- "credential not configured": EIA_API_KEY is unset on the gateway (503).`;

export const eiaConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Energy Data (EIA)",
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
