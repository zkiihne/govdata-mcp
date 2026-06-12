import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "nvd";
const UPSTREAM = "https://services.nvd.nist.gov/rest/json";
const TIER = "free" as const;

/** Mirrors sources/nvd/source.json → auth (api-key, header "apiKey"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "header",
  paramName: "apiKey",
  credentialRef: "env:NVD_API_KEY",
  signupUrl: "https://nvd.nist.gov/developers/request-an-api-key",
};

const DESCRIPTION = `Raw passthrough to the NVD — NIST National Vulnerability Database (services.nvd.nist.gov/rest/json). CVE records with CVSS scores, affected products (CPE), references, and change history. The apiKey header is injected only when configured (works keyless at lower rate limits).

ENDPOINT PATTERNS
- GET /cves/2.0 — search CVE records by id, keyword, CVSS severity, CPE, date range.
- GET /cvehistory/2.0 — change history for CVE records.

PARAMETER FORMAT
- One record: cveId=CVE-YYYY-NNNN (full form, case-sensitive).
- Filters: keywordSearch=, cvssV3Severity=(LOW|MEDIUM|HIGH|CRITICAL), cpeName=,
  pubStartDate/pubEndDate or lastModStartDate/lastModEndDate.
- Paging: startIndex / resultsPerPage (max 2000); totalResults is in the envelope.
- The key goes in the apiKey HEADER, never the query string.

DATE FILTERS (read this before using any date param — these are the #1 source of 404s)
- Format MUST be a full ISO-8601 date-TIME, not a bare date. A date-only value
  like "2022-01-01" returns 404. Use "2022-01-01T00:00:00.000Z" (or with an
  explicit offset, e.g. "2022-01-01T00:00:00.000-05:00").
- pubStartDate and pubEndDate must BOTH be present (same for lastMod*); a lone
  start or end is rejected.
- Max span is 120 DAYS. A range wider than 120 days returns 404 (NOT a helpful
  error — it looks like a bad request). To cover a full year, WINDOW it: split
  into ~4 quarterly calls (≤120 days each) and merge results, e.g.
  Jan 1–Mar 31, Apr 1–Jun 30, Jul 1–Sep 30, Oct 1–Dec 31.

EXAMPLE QUERIES
1. Fetch one CVE by id:
   method "GET", path "/cves/2.0", params {"cveId":"CVE-2021-44228"}
2. Critical CVEs matching a keyword:
   method "GET", path "/cves/2.0", params {"keywordSearch":"openssl","cvssV3Severity":"CRITICAL","resultsPerPage":"10"}
3. CVEs published in one window (≤120 days — note the ISO date-time format):
   method "GET", path "/cves/2.0", params {"pubStartDate":"2022-01-01T00:00:00.000Z","pubEndDate":"2022-03-31T23:59:59.999Z","resultsPerPage":"50"}

COMMON ERRORS
- 404 with no body on a date query: almost always either a date-only value
  (use the full ISO date-time, see DATE FILTERS) or a span > 120 days.
- 404 "Invalid parameter: apiKey": the key was sent as a query param — it must be a header (the gateway handles this).
- 403/429 when keyless: keyless is 5 req/30s; NVD_API_KEY raises it to 50/30s.`;

export const nvdConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Vulnerabilities (NVD / CVE)",
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
