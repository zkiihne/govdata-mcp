import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "clinical-trials";
const UPSTREAM = "https://clinicaltrials.gov/api/v2";

/** Mirrors sources/clinical-trials/source.json → auth (none; injector no-ops). */
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

const DESCRIPTION = `Raw passthrough to ClinicalTrials.gov v2 (clinicaltrials.gov/api/v2): the registry of clinical studies worldwide. No API key (~50 req/min/IP). JSON returned verbatim.

ENDPOINT PATTERNS
- GET /studies — search by term/condition/intervention/status; supports field selection + paging.
- GET /studies/{nctId} — full record for one study (e.g. /studies/NCT01884792).

PARAMETER FORMAT
- query.term (free text), query.cond (condition), query.intr (intervention), query.locn (location).
- filter.overallStatus: RECRUITING | COMPLETED | TERMINATED | NOT_YET_RECRUITING ...
- fields: leaf names, e.g. "NCTId,BriefTitle,OverallStatus".
- pageSize (default 10, max 1000); paginate with pageToken = the nextPageToken from the prior response.

EXAMPLE QUERIES
1. Recruiting diabetes studies:
   "GET", "/studies", params {"query.cond":"diabetes","filter.overallStatus":"RECRUITING","fields":"NCTId,BriefTitle,OverallStatus","pageSize":"5"}
2. One trial by id:
   "GET", "/studies/NCT01884792"

COMMON ERRORS
- Default pageSize is 10 — set it explicitly. Pagination is token-based (nextPageToken → pageToken), not offset.
- Records nest under protocolSection.<module>; fields= takes leaf names like NCTId, not dotted paths.`;

export const clinicalTrialsConnector: Connector = {
  id: ID,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "ClinicalTrials.gov — Study Registry (NIH)",
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
