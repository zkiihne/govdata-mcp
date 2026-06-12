import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "treasury-fiscal";
const UPSTREAM = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";
const TIER = "free" as const;

/** Mirrors sources/treasury-fiscal/source.json → auth (none; injector no-ops). */
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

const DESCRIPTION = `Raw passthrough to Treasury Fiscal Data (api.fiscaldata.treasury.gov): national debt, daily Treasury statement, interest/exchange rates, spending and revenue. No API key. JSON returned verbatim.

ENDPOINT PATTERNS
- GET /v2/accounting/od/debt_to_penny — total public debt, daily.
- GET /v1/accounting/od/rates_of_exchange — Treasury exchange rates by country/currency.
- GET /v2/accounting/od/avg_interest_rates — average interest rates on Treasury securities.

PARAMETER FORMAT
- fields: comma-separated columns (dataset-specific).
- filter: field:operator:value, ops lt/lte/gt/gte/eq/in, comma-joined. e.g. "record_date:gte:2024-01-01".
- sort: column name; prefix "-" for descending (e.g. "-record_date").
- page[size] (max 10000, default 100), page[number].

EXAMPLE QUERIES
1. Latest debt to the penny:
   "GET", "/v2/accounting/od/debt_to_penny", params {"sort":"-record_date","page[size]":"1"}
2. 2024 Euro exchange rates:
   "GET", "/v1/accounting/od/rates_of_exchange", params {"filter":"record_date:gte:2024-01-01,currency:eq:Euro","fields":"country_currency_desc,exchange_rate,record_date","sort":"-record_date"}

COMMON ERRORS
- Paging uses bracketed page[size]/page[number], not limit/offset.
- Column names differ per dataset — use that dataset's documented fields.`;

export const treasuryFiscalConnector: Connector = {
  id: ID,
  tier: TIER,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Treasury Fiscal Data — Debt & Rates (U.S. Treasury)",
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
