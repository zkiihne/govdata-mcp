import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "census-acs";
const UPSTREAM = "https://api.census.gov/data";
const TIER = "free" as const;

/** Mirrors sources/census-acs/source.json → auth (api-key, query "key"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "query",
  paramName: "key",
  credentialRef: "env:CENSUS_API_KEY",
  signupUrl: "https://api.census.gov/data/key_signup.html",
};

const DESCRIPTION = `Raw passthrough to the U.S. Census Bureau American Community Survey (api.census.gov/data). Keyless up to ~500 req/day per IP; a free key (injected automatically when configured) raises the cap. JSON returned verbatim.

ENDPOINT PATTERNS
- GET /{year}/acs/acs5
    ACS 5-year detailed tables. Select variables with get= and geography with for=/in=. Response is a JSON ARRAY-OF-ARRAYS; row 0 is the header.

PARAMETER FORMAT
- get: comma-separated variable codes, e.g. "NAME,B01001_001E" (B01001_001E = total population). Max 50 variables per request. Codes end in E (estimate) or M (margin of error).
- for: the target geography, e.g. "state:*", "county:031", "tract:*".
- in: the parent geography for sub-state geos, e.g. "state:08". Required when "for" is county/tract/block group.
- year: 4-digit, e.g. 2022 (latest ACS5 vintage available).

EXAMPLE QUERIES
1. Total population by state (2022 ACS5):
   method "GET", path "/2022/acs/acs5", params {"get":"NAME,B01001_001E","for":"state:*"}
2. Median household income for Boulder County, CO (FIPS state 08, county 013):
   method "GET", path "/2022/acs/acs5", params {"get":"NAME,B19013_001E","for":"county:013","in":"state:08"}

COMMON ERRORS
- 400 with "unknown variable": a variable code is wrong or unavailable in that year's ACS5.
- 204 / empty: the geography hierarchy is incomplete — sub-state "for" needs a matching "in".
- Response is array-of-arrays, NOT array-of-objects — map row 0 (header) onto subsequent rows yourself.`;

export const censusAcsConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Demographics — ACS 5-Year (U.S. Census Bureau)",
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

    // Optional injection: Census works keyless; inject the key only when set so
    // the connector stays live without a credential but benefits from one.
    if (process.env.CENSUS_API_KEY) {
      injectAuth(AUTH, { url, headers });
    }

    const res = await fetch(url, { method, headers });

    const contentType = res.headers.get("content-type") ?? undefined;
    const data: unknown = contentType?.includes("json")
      ? await res.json()
      : await res.text();

    return { status: res.status, data, contentType };
  },
};
