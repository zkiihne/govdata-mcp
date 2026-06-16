import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "bea";
const UPSTREAM = "https://apps.bea.gov/api";

/** Mirrors sources/bea/source.json → auth (api-key, query "UserID"). */
const AUTH: AuthSpec = {
  type: "api-key",
  placement: "query",
  paramName: "UserID",
  credentialRef: "env:BEA_API_KEY",
  signupUrl: "https://apps.bea.gov/API/signup/",
};

const DESCRIPTION = `Raw passthrough to the BEA — Bureau of Economic Analysis API (apps.bea.gov/api). US economic accounts: GDP (NIPA), regional income/GDP, input-output, international trade and investment, and fixed assets. Requires a free key (injected as UserID).

ENDPOINT PATTERNS
- GET /data?method={operation}&...&ResultFormat=JSON
    ONE endpoint; the method= param selects the operation, NOT the URL path.
    Operations: GetDataSetList, GetParameterList, GetParameterValues, GetData.

PARAMETER FORMAT
- ResultFormat=JSON is effectively required — the default is XML.
- Discover structure first: GetDataSetList → GetParameterList&datasetname= →
  GetParameterValues&datasetname=&ParameterName=, then GetData.
- GetData needs datasetname=<ds> plus that dataset's params (e.g. TableName, Frequency, Year).

EXAMPLE QUERIES
1. List available datasets:
   method "GET", path "/data", params {"method":"GetDataSetList","ResultFormat":"JSON"}
2. Annual real GDP (NIPA table T10101):
   method "GET", path "/data", params {"method":"GetData","datasetname":"NIPA","TableName":"T10101","Frequency":"A","Year":"2023","ResultFormat":"JSON"}

COMMON ERRORS
- XML instead of JSON: add ResultFormat=JSON.
- Missing/invalid params: walk GetParameterList/GetParameterValues to learn a dataset's required params before GetData.
- "credential not configured": BEA_API_KEY is unset on the gateway (503).`;

export const beaConnector: Connector = {
  id: ID,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Economic Accounts (BEA)",
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
