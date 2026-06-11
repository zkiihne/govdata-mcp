import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";

const ID = "noaa-weather";
const UPSTREAM = "https://api.weather.gov";

/** Mirrors sources/noaa-weather/source.json → auth (type none; injector no-ops). */
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

/**
 * api.weather.gov asks every client to send a descriptive User-Agent so they
 * can contact you about excessive use. Override via NWS_USER_AGENT if desired.
 */
const USER_AGENT =
  process.env.NWS_USER_AGENT ?? "govdata-mcp (https://github.com/zkiihne/govdata-mcp)";

const DESCRIPTION = `Raw passthrough to the U.S. National Weather Service API (api.weather.gov). Free, no API key. GeoJSON responses are returned verbatim — no normalization.

ENDPOINT PATTERNS
- GET /points/{lat},{lon}
    Entry point for any coordinate. lat/lon are decimal degrees, comma-separated, no space, ~4 decimals max (e.g. /points/39.7456,-104.9903). Response .properties contains followup URLs: .forecast (12-hour periods), .forecastHourly, .forecastGridData, and .relativeLocation (nearest city).
- GET /gridpoints/{office}/{gridX},{gridY}/forecast
    The forecast URL returned by /points. Response .properties.periods[] each have: name, temperature, temperatureUnit, windSpeed, windDirection, shortForecast, detailedForecast.
- GET /alerts/active?area={STATE}
    Active watches/warnings. area is a 2-letter state code (e.g. CO). Response .features[] are alert objects.
- GET /stations/{stationId}/observations/latest
    Latest observation for a station.

PARAMETER FORMAT
- Pass the path in rawQuery.path exactly as above. Optional querystring goes in rawQuery.params (e.g. {"area":"CO"}). Method defaults to GET; this API is read-only.
- Coordinates: decimal degrees, "lat,lon", western/southern hemispheres negative.

EXAMPLE QUERIES
1. Forecast for Denver, CO (two-step):
   a) path "/points/39.7456,-104.9903" → read .properties.forecast (e.g. ".../gridpoints/BOU/62,61/forecast")
   b) path "/gridpoints/BOU/62,61/forecast" → read .properties.periods[0].detailedForecast
2. Active alerts for Colorado:
   path "/alerts/active", params {"area":"CO"}

COMMON ERRORS
- 404 on /points: coordinates are outside NWS coverage (US + territories only) or malformed (space after comma, too many decimals).
- 301/302: NWS redirects bare coordinate precision; pass ~4 decimals to avoid.
- 403 / "User-Agent" complaint: a User-Agent header is required (this connector sets one automatically).`;

export const noaaConnector: Connector = {
  id: ID,
  tier: "free",

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "Weather & Forecasts (NOAA / National Weather Service)",
      tier: "free",
      upstreamBaseUrl: UPSTREAM,
      description: DESCRIPTION,
    };
  },

  async execute(rawQuery: RawQuery): Promise<ExecuteResult> {
    const method = rawQuery.method ?? "GET";
    const url = new URL(rawQuery.path.replace(/^\//, ""), `${UPSTREAM}/`);
    if (rawQuery.params) {
      for (const [k, v] of Object.entries(rawQuery.params)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/geo+json,application/json",
      ...(rawQuery.body ? { "Content-Type": "application/json" } : {}),
    };
    // Generic credential injection per the source's auth block (no-op for NOAA).
    injectAuth(AUTH, { url, headers });

    const res = await fetch(url, {
      method,
      headers,
      ...(rawQuery.body ? { body: JSON.stringify(rawQuery.body) } : {}),
    });

    const contentType = res.headers.get("content-type") ?? undefined;
    const data: unknown = contentType?.includes("json")
      ? await res.json()
      : await res.text();

    return { status: res.status, data, contentType };
  },
};
