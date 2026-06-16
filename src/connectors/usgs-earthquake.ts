import type {
  Connector,
  ConnectorDescription,
  ExecuteResult,
  RawQuery,
} from "./types.js";
import type { AuthSpec } from "../catalog/schema.js";
import { injectAuth } from "./inject.js";
import { applyParams } from "./params.js";

const ID = "usgs-earthquake";
const UPSTREAM = "https://earthquake.usgs.gov/fdsnws/event/1";

/** Mirrors sources/usgs-earthquake/source.json → auth (none; injector no-ops). */
const AUTH: AuthSpec = {
  type: "none",
  placement: null,
  paramName: null,
  credentialRef: null,
  signupUrl: null,
};

const DESCRIPTION = `Raw passthrough to the USGS Earthquake Catalog (earthquake.usgs.gov/fdsnws/event/1): global real-time and historical seismic events via the FDSN event service. No API key. Returns GeoJSON when format=geojson.

ENDPOINT PATTERNS
- GET /query?format=geojson&... — search events by time/magnitude/location.
- GET /count?... — count matching events (same params as /query).

PARAMETER FORMAT
- format=geojson (REQUIRED for JSON; default is QuakeML XML).
- starttime/endtime: ISO 8601 or YYYY-MM-DD (UTC).
- minmagnitude/maxmagnitude, mindepth/maxdepth.
- Radial: latitude + longitude + maxradiuskm (all three). Box: minlatitude/maxlatitude/minlongitude/maxlongitude.
- orderby: time | time-asc | magnitude | magnitude-asc. limit: cap results.

EXAMPLE QUERIES
1. M5+ worldwide, one day:
   "GET", "/query", params {"format":"geojson","starttime":"2024-01-01","endtime":"2024-01-02","minmagnitude":"5"}
2. Quakes within 200km of LA, strongest first:
   "GET", "/query", params {"format":"geojson","latitude":"34.05","longitude":"-118.25","maxradiuskm":"200","minmagnitude":"3","orderby":"magnitude","limit":"20"}

COMMON ERRORS
- Omitting format=geojson returns XML.
- More than 20000 matching events → HTTP 400: narrow the window or raise minmagnitude (use /count to size first).`;

export const usgsEarthquakeConnector: Connector = {
  id: ID,

  describe(): ConnectorDescription {
    return {
      id: ID,
      name: "USGS Earthquake Catalog (FDSN event)",
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
