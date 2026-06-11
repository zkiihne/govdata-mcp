# Candidate sources

Backlog of vetting candidates captured from earlier flat-file specs (removed in favor of the `sources/<id>/source.json` layout). Names, agencies, and docs URLs only — endpoint/auth details below were unverified and must be re-confirmed during the Vet phase before onboarding.

Converted to `sources/<id>/source.json` and removed from this backlog: congress-gov, eia, federal-register, openfda, treasury-fiscal-data (→ treasury-fiscal), usgs-earthquake, usgs-water.

| id | name | agency | docs |
|----|------|--------|------|
| cdc-open-data | CDC Open Data (Socrata) | Centers for Disease Control and Prevention | https://dev.socrata.com/ |
| census-bureau | Census Bureau Data API (ACS / Decennial / PEP) | U.S. Census Bureau | https://www.census.gov/data/developers/data-sets.html |
| data-gov | Data.gov CKAN Catalog API | U.S. General Services Administration | https://docs.ckan.org/en/latest/api/ |
| dol | DOL APIs (OSHA Enforcement & DOL datasets) | U.S. Department of Labor | https://dataportal.dol.gov/ |
| fcc | FCC APIs (Broadband Map + License View) | Federal Communications Commission | https://us-fcc.app.box.com/v/bdc-public-data-api-spec |
| govinfo | GovInfo API | U.S. Government Publishing Office | https://api.govinfo.gov/docs/ |
| nasa | NASA Open APIs | National Aeronautics and Space Administration | https://api.nasa.gov/ |
| nhtsa | NHTSA APIs (vPIC, Recalls, Safety Ratings, Complaints) | National Highway Traffic Safety Administration | https://vpic.nhtsa.dot.gov/api/ |

## Descriptions

1. **cdc-open-data** — CDC public health datasets via the Socrata Open Data API: mortality, chronic disease, vaccination, surveillance.
2. **census-bureau** — American Community Survey, Decennial Census, and Population Estimates: demographics, income, housing, education by geography. (Note: overlaps with the live `census-acs` folder — scope before adding.)
3. **data-gov** — Discovery catalog of 250k+ US government datasets across agencies (CKAN).
4. **dol** — Department of Labor datasets including OSHA enforcement/inspections, wage and hour (WHD) violations, MSHA mine safety, EBSA.
5. **fcc** — Broadband availability/coverage (National Broadband Map / BDC), geography lookups (Area API), spectrum license search (License View).
6. **govinfo** — Official publications from all three branches: Federal Register, CFR, US Code, public laws, bills, Congressional Record, court opinions, budget.
7. **nasa** — Family of NASA APIs: APOD, Near-Earth Objects, DONKI space weather, Mars rover photos, EPIC/Earth imagery, exoplanet archive.
8. **nhtsa** — Vehicle data: VIN decoding (vPIC), safety recalls, NCAP crash-test ratings, consumer complaints.
