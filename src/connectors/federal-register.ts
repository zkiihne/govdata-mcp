import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "federal-register";
const UPSTREAM = "https://www.federalregister.gov/api/v1";
const TIER = "free" as const;

/** Mirrors sources/federal-register/source.json → auth (none; injector no-ops). */
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

const DESCRIPTION = `Raw passthrough to the Federal Register API (www.federalregister.gov/api/v1): the daily journal of the US federal government — rules, proposed rules, notices, and presidential documents. No API key. JSON returned verbatim.

ENDPOINT PATTERNS
- GET /documents.json — search documents by term/agency/type/date.
- GET /documents/{document_number}.json — one document by its FR number.

PARAMETER FORMAT (bracketed conditions)
- conditions[term]: full-text search.
- conditions[type][]: RULE | PRORULE | NOTICE | PRESDOCU (array → trailing []).
- conditions[agencies][]: agency slug, e.g. "securities-and-exchange-commission".
- conditions[publication_date][gte]/[lte]: YYYY-MM-DD.
- fields[]: returned columns (title, type, publication_date, html_url, ...). per_page (max 1000), page, order=newest.

EXAMPLE QUERIES
1. Recent proposed rules mentioning 'privacy':
   "GET", "/documents.json", params {"conditions[term]":"privacy","conditions[type][]":"PRORULE","per_page":"5","order":"newest"}
2. SEC docs in a date range, titles only:
   "GET", "/documents.json", params {"conditions[agencies][]":"securities-and-exchange-commission","conditions[publication_date][gte]":"2024-01-01","conditions[publication_date][lte]":"2024-03-31","fields[]":"title","per_page":"10"}

COMMON ERRORS
- Array filters need the trailing []: conditions[type][], conditions[agencies][], fields[].
- Agencies are slugs, not display names. Deep pagination is capped (~2000) — narrow with date/agency.`;

export const federalRegisterConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Federal Register API (Office of the Federal Register)",
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
