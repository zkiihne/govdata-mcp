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
  pubStartDate/pubEndDate or lastModStartDate/lastModEndDate (ISO 8601, max 120-day span).
- Paging: startIndex / resultsPerPage (max 2000); totalResults is in the envelope.
- The key goes in the apiKey HEADER, never the query string.

EXAMPLE QUERIES
1. Fetch one CVE by id:
   method "GET", path "/cves/2.0", params {"cveId":"CVE-2021-44228"}
2. Critical CVEs matching a keyword:
   method "GET", path "/cves/2.0", params {"keywordSearch":"openssl","cvssV3Severity":"CRITICAL","resultsPerPage":"10"}

COMMON ERRORS
- 404 "Invalid parameter: apiKey": the key was sent as a query param — it must be a header (the gateway handles this).
- Date range > 120 days: split into windows.
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
