import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "usaspending";
const UPSTREAM = "https://api.usaspending.gov/api/v2";

/** Mirrors sources/usaspending/source.json → auth (type none; injector no-ops). */
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

const DESCRIPTION = `Raw passthrough to USAspending.gov (api.usaspending.gov/api/v2), the U.S. Treasury's federal spending API. No API key. JSON returned verbatim.

ENDPOINT PATTERNS
- POST /search/spending_by_award/
    Search awards (contracts, grants, loans). Body is a JSON object with "filters" (required), "fields" (columns to return), "limit", and "page". Response .results[] are award rows; .page_metadata has pagination.
- GET /agency/{toptier_code}/
    Budgetary overview for one agency (toptier_code is a 3- or 4-digit string, e.g. "012" = USDA).
- GET /references/toptier_agencies/
    List every agency with its toptier_code — use this to resolve an agency name to a code.

PARAMETER FORMAT
- Most search endpoints are POST with a JSON body, NOT query params. Put the body in rawQuery.body.
- filters.time_period is an array of {start_date, end_date} in "YYYY-MM-DD".
- filters.award_type_codes: contracts ["A","B","C","D"], grants ["02","03","04","05"], loans ["07","08"].
- fields is an array of display column names exactly as documented (e.g. "Award ID","Recipient Name","Award Amount").

FILTER OBJECT SHAPES (the filters schema is strict — use these exact shapes)
- Agency: filters.agencies is an array of {type, tier, name}. type is "awarding" or "funding";
  tier is "toptier" or "subtier"; the agency is identified by its NAME, e.g.
  {"type":"awarding","tier":"toptier","name":"Department of Veterans Affairs"}.
  IMPORTANT: there is NO toptier_code key here. Passing {"toptier_code":"036"} is rejected
  and — confusingly — surfaces as 422 "Missing value: 'filters' is a required field" (the
  whole filters object is treated as invalid). Use name. Resolve names via GET /references/toptier_agencies/.
- Place of performance: filters.place_of_performance_locations is an array of location objects,
  e.g. {"country":"USA","state":"CA"} (state is the 2-letter USPS code).
- Time period: filters.time_period is an array of {start_date, end_date} in "YYYY-MM-DD".
- Award types: filters.award_type_codes — grants ["02","03","04","05"], contracts ["A","B","C","D"], loans ["07","08"].

EXAMPLE QUERIES
1. Contract awards for FY2024 (top 5 by amount):
   method "POST", path "/search/spending_by_award/", body {"filters":{"award_type_codes":["A","B","C","D"],"time_period":[{"start_date":"2023-10-01","end_date":"2024-09-30"}]},"fields":["Award ID","Recipient Name","Award Amount"],"limit":5}
2. Multi-filter: VA grants performed in California for FY2023 (agency BY NAME, not code):
   method "POST", path "/search/spending_by_award/", body {"filters":{"agencies":[{"type":"awarding","tier":"toptier","name":"Department of Veterans Affairs"}],"award_type_codes":["02","03","04","05"],"place_of_performance_locations":[{"country":"USA","state":"CA"}],"time_period":[{"start_date":"2022-10-01","end_date":"2023-09-30"}]},"fields":["Award ID","Recipient Name","Award Amount"],"limit":10}
3. List agency codes/names:
   method "GET", path "/references/toptier_agencies/"

COMMON ERRORS
- 422 "Missing value: 'filters' is a required field" EVEN WHEN you sent filters: an unrecognized
  key inside filters (most often a toptier_code in the agencies filter — use name instead) invalidates
  the whole object. Check every filter against FILTER OBJECT SHAPES above.
- 422 on /search/*: malformed filters object — check award_type_codes and time_period shape. The filters schema is strict.
- 405 / empty: you sent GET to a POST-only search endpoint. Set method "POST" and supply a body.
- Large result sets: paginate with body.page (1-based) and body.limit; do not expect everything in one call.`;

export const usaspendingConnector: Connector = {
  id: ID,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Federal Spending (USAspending / U.S. Treasury)",
      upstreamBaseUrl: UPSTREAM,
      description: DESCRIPTION,
    };
  },

  async execute(rawQuery: RawQuery): Promise<ExecuteResult> {
    const method = rawQuery.method ?? "GET";
    const url = new URL(rawQuery.path.replace(/^\//, ""), `${UPSTREAM}/`);
    applyParams(url, rawQuery.params);

    const headers: Record<string, string> = { Accept: "application/json" };
    const body: Record<string, unknown> | undefined =
      rawQuery.body && typeof rawQuery.body === "object"
        ? { ...(rawQuery.body as Record<string, unknown>) }
        : (rawQuery.body as Record<string, unknown> | undefined);

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
