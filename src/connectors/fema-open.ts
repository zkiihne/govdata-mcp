import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "fema-open";
const UPSTREAM = "https://www.fema.gov/api/open";
const TIER = "free" as const;

/** Mirrors sources/fema-open/source.json → auth (none; injector no-ops). */
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

const DESCRIPTION = `Raw passthrough to OpenFEMA (www.fema.gov/api/open): FEMA disaster declarations, NFIP flood-insurance claims, and assistance. No API key. JSON returned verbatim.

ENDPOINT PATTERNS
- GET /v2/DisasterDeclarationsSummaries — every FEMA disaster declaration.
- GET /v2/FimaNfipClaims — redacted NFIP flood-insurance claims.
- GET /v1/DataSets — catalog of datasets + current versions (discover entity names/versions).

PARAMETER FORMAT (OData $-prefixed)
- $filter: e.g. "state eq 'TX'" (single-quoted string values).
- $top: max 10000 (default page size 1000). $skip: pagination offset.
- $orderby: e.g. "declarationDate desc". $select / $inlinecount=allpages.

EXAMPLE QUERIES
1. Latest 5 Texas declarations:
   "GET", "/v2/DisasterDeclarationsSummaries", params {"$filter":"state eq 'TX'","$orderby":"declarationDate desc","$top":"5"}
2. Count NFIP claims for a county FIPS:
   "GET", "/v2/FimaNfipClaims", params {"$filter":"countyCode eq '48201'","$top":"1","$inlinecount":"allpages"}

COMMON ERRORS
- Datasets are versioned (v1/v2); a retired version 404s — check /v1/DataSets.
- $filter strings need single quotes; $top over 10000 is rejected.`;

export const femaOpenConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "OpenFEMA — Disasters & NFIP (FEMA)",
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
