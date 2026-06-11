# usgs-water — working notes

**FLAG: endpoints provisional, do not implement without vetting.**

USGS is migrating water data off the legacy NWIS web services to a new keyed
OGC-API platform:

- **Legacy (keyless, being retired):** `https://waterservices.usgs.gov`
  (e.g. `/nwis/iv/?format=json&sites=...&parameterCd=00060` for instantaneous
  streamflow). Stable for now but USGS has announced decommissioning of several
  NWIS endpoints.
- **New (keyed):** `https://api.waterdata.usgs.gov` — OGC API Features style,
  requires an API key. Paths, version (`ogcapi/v0/...`), and collection ids in
  this spec are **placeholders** and must be confirmed against the live docs.

Before promoting past `planned`:
1. Decide which host to target (legacy NWIS vs new OGC API) based on the
   migration timeline at decommission time.
2. Confirm the real collection/endpoint paths and required params from
   https://api.waterdata.usgs.gov/docs/ (or the NWIS docs if staying on legacy).
3. Re-confirm the auth model: param name, placement, and signup URL for the key.
4. Only then write the connector and fill real llmDocs/exampleQueries.
