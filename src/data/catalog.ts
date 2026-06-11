import type { Tier } from "../connectors/types.js";

/**
 * Static directory of data categories exposed by the gateway. Hardcoded here so
 * adding a new source is a one-object edit. The discovery tool serializes this
 * verbatim; the router reads `tier` from it to decide free vs. premium routing.
 */
export interface CatalogEntry {
  id: string;
  name: string;
  tier: Tier;
  /** Base URL of the upstream API. */
  upstreamBaseUrl: string;
  /** Brief, agent-readable notes on the upstream schema / shape. */
  schemaNotes: string;
  /** One concrete native query an agent could run against the upstream API. */
  exampleNativeQuery: string;
  /** True once a real connector is wired; false = directory entry only (no execute yet). */
  connectorImplemented: boolean;
}

export const CATALOG: readonly CatalogEntry[] = [
  {
    id: "noaa",
    name: "Weather & Forecasts (NOAA / National Weather Service)",
    tier: "free",
    upstreamBaseUrl: "https://api.weather.gov",
    schemaNotes:
      "GeoJSON. Flow is two-step: GET /points/{lat},{lon} returns a properties.forecast URL, then GET that URL returns periods[] with temperature, windSpeed, shortForecast. No API key. Requires a User-Agent header.",
    exampleNativeQuery: "GET https://api.weather.gov/points/39.7456,-104.9903",
    connectorImplemented: true,
  },
  {
    id: "census",
    name: "U.S. Census Bureau (ACS / Decennial basics)",
    tier: "free",
    upstreamBaseUrl: "https://api.census.gov/data",
    schemaNotes:
      "Returns a JSON array-of-arrays; row 0 is the header. Query selects variables via `get=` and geography via `for=`/`in=`. Optional `key=` raises rate limits. e.g. variable B01001_001E = total population.",
    exampleNativeQuery:
      "GET https://api.census.gov/data/2022/acs/acs5?get=NAME,B01001_001E&for=state:*",
    connectorImplemented: false,
  },
  {
    id: "bls",
    name: "Labor Statistics (BLS — CPI, employment, wages)",
    tier: "free",
    upstreamBaseUrl: "https://api.bls.gov/publicAPI/v2",
    schemaNotes:
      "POST JSON to /timeseries/data/ with {seriesid:[...], startyear, endyear}. Returns Results.series[].data[] with year, period (M01..M12), value. v2 needs a registrationkey for higher limits. e.g. series CUUR0000SA0 = CPI-U all items.",
    exampleNativeQuery:
      'POST https://api.bls.gov/publicAPI/v2/timeseries/data/ {"seriesid":["CUUR0000SA0"],"startyear":"2023","endyear":"2024"}',
    connectorImplemented: false,
  },
  {
    id: "sec-filings",
    name: "SEC EDGAR (company filings, XBRL facts)",
    tier: "premium",
    upstreamBaseUrl: "https://data.sec.gov",
    schemaNotes:
      "JSON. /submissions/CIK{10-digit-zero-padded}.json lists a company's filings; /api/xbrl/companyconcept/... returns tagged financial facts. No key, but a descriptive User-Agent is mandatory. CIK must be zero-padded to 10 digits.",
    exampleNativeQuery: "GET https://data.sec.gov/submissions/CIK0000320193.json",
    connectorImplemented: false,
  },
  {
    id: "property-records",
    name: "Property & Parcel Records",
    tier: "premium",
    upstreamBaseUrl: "https://example-property-records.api",
    schemaNotes:
      "Placeholder. Upstream provider TBD (commercial parcel/deed aggregator). Will require a server-held API key and is metered behind HTTP 402.",
    exampleNativeQuery: "GET /parcels?address=1600+Pennsylvania+Ave+NW+Washington+DC",
    connectorImplemented: false,
  },
] as const;

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id);
}
