import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";

const ID = "congress-gov";
const UPSTREAM = "https://api.congress.gov/v3";
const TIER = "free" as const;

/** Mirrors sources/congress-gov/source.json → auth (api-key, query "api_key"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "query",
  paramName: "api_key",
  credentialRef: "env:CONGRESS_API_KEY",
  signupUrl: "https://api.congress.gov/sign-up/",
};

const DESCRIPTION = `Raw passthrough to the Congress.gov API (api.congress.gov/v3). US legislative data: bills, amendments, members, committees, the Congressional Record, nominations, and treaties from 1973 onward. Requires a free api.data.gov key (injected as api_key).

ENDPOINT PATTERNS
- GET /bill?format=json — list bills; also /member, /committee, /nomination.
- GET /bill/{congress}/{billType}/{billNumber}?format=json — bill detail.
- GET /member/{bioguideId}?format=json — member profile.

PARAMETER FORMAT
- format=json is required — the default response is XML.
- billType is lowercase: hr, s, hjres, sjres, hconres, sconres, hres, sres.
- Paging is offset/limit (limit max 250). Filter bill lists with fromDateTime/toDateTime; sort e.g. "updateDate+desc".

EXAMPLE QUERIES
1. Detail for H.R. 1 of the 118th Congress:
   method "GET", path "/bill/118/hr/1", params {"format":"json"}
2. Most recently updated bills:
   method "GET", path "/bill", params {"format":"json","sort":"updateDate+desc","limit":"20"}

COMMON ERRORS
- XML instead of JSON: add format=json.
- 404 on a bill: check billType is lowercase and the number/congress are correct.
- "credential not configured": CONGRESS_API_KEY is unset on the gateway (503).`;

export const congressGovConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "US Legislation (Congress.gov)",
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
