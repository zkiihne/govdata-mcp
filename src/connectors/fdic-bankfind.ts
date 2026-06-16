import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "fdic-bankfind";
const UPSTREAM = "https://api.fdic.gov/banks";

/** Mirrors sources/fdic-bankfind/source.json → auth (none; injector no-ops). */
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

const DESCRIPTION = `Raw passthrough to the FDIC BankFind Suite (api.fdic.gov/banks): FDIC-insured bank directory, quarterly financials, and historical failures. No API key. JSON returned verbatim.

ENDPOINT PATTERNS
- GET /institutions — search insured institutions by name/location/charter/status.
- GET /financials — quarterly call-report metrics (by CERT).
- GET /failures — historical bank failures.

PARAMETER FORMAT
- filters: Elasticsearch syntax, field:value with AND/OR and ranges, e.g. "STALP:CA AND ACTIVE:1", "FAILYR:[2008 TO 2025]".
- search: full-text. fields: comma-separated columns (NAME, CITY, STALP, CERT, ...).
- limit (default 10, max 10000), offset. sort_by + sort_order (ASC|DESC).

EXAMPLE QUERIES
1. Active California banks:
   "GET", "/institutions", params {"filters":"STALP:CA AND ACTIVE:1","fields":"NAME,CITY,STALP,CERT","limit":"5"}
2. Illinois failures since 2008:
   "GET", "/failures", params {"filters":"PSTALP:IL AND FAILYR:[2008 TO 2025]","fields":"NAME,CITYST,FAILDATE","sort_by":"FAILDATE","sort_order":"DESC","limit":"10"}

COMMON ERRORS
- Host migrated to api.fdic.gov/banks (old banks.data.fdic.gov/api 301-redirects).
- Results are wrapped: each is { data: {...}, score }; the top level has meta.total — read .data[].data.
- Default limit is 10 — set it explicitly and paginate with offset.`;

export const fdicBankfindConnector: Connector = {
  id: ID,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "FDIC BankFind Suite (FDIC)",
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
