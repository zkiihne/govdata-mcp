import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "openfda";
const UPSTREAM = "https://api.fda.gov";
const TIER = "free" as const;

/** Mirrors sources/openfda/source.json → auth (api-key, query "api_key"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "query",
  paramName: "api_key",
  credentialRef: "env:OPENFDA_API_KEY",
  signupUrl: "https://open.fda.gov/apis/authentication/",
};

const DESCRIPTION = `Raw passthrough to the openFDA API (api.fda.gov). FDA data on drugs, devices, and foods: adverse events, recalls/enforcement, product labels, and the NDC directory. The api_key is injected only when configured (works keyless at lower per-IP limits).

ENDPOINT PATTERNS
- GET /drug/event.json — adverse event reports (FAERS).
- GET /drug/enforcement.json — drug recall enforcement reports.
- GET /device/event.json — medical device adverse events (MAUDE).
  (Other domains follow /{domain}/{subject}.json.)

PARAMETER FORMAT
- search=<field>:<value> — Lucene syntax; AND/OR, ranges, date ranges like [20240101+TO+20241231].
- Exact-match fields need the .exact suffix (especially with count=).
- count=<field> returns aggregated buckets (different response shape), not raw records.
- Paging: limit (max 1000), skip (max 25000); beyond that, narrow the search.

EXAMPLE QUERIES
1. Count adverse-event reports by reaction for a drug:
   method "GET", path "/drug/event.json", params {"search":"patient.drug.medicinalproduct:aspirin","count":"patient.reaction.reactionmeddrapt.exact"}
2. Recent drug recall enforcement reports:
   method "GET", path "/drug/enforcement.json", params {"search":"report_date:[20240101+TO+20241231]","limit":"5"}

COMMON ERRORS
- Unexpected shape: count= returns buckets, not records.
- No matches: check field path and the .exact suffix on exact-match/count fields.
- 429: keyless is rate-limited per IP; set OPENFDA_API_KEY to raise the daily cap.`;

export const openfdaConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "FDA Drugs/Devices/Food (openFDA)",
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
