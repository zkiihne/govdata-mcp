# Candidate sources

Backlog of vetting candidates captured from earlier flat-file specs (removed in favor of the `sources/<id>/source.json` layout). Names, agencies, and docs URLs only — endpoint/auth details below were unverified and must be re-confirmed during the Vet phase before onboarding.

| id | name | agency | docs |
|----|------|--------|------|
| cdc-open-data | CDC Open Data (Socrata) | Centers for Disease Control and Prevention | https://dev.socrata.com/ |
| census-bureau | Census Bureau Data API (ACS / Decennial / PEP) | U.S. Census Bureau | https://www.census.gov/data/developers/data-sets.html |
| congress-gov | Congress.gov API | Library of Congress | https://api.congress.gov/ |
| data-gov | Data.gov CKAN Catalog API | U.S. General Services Administration | https://docs.ckan.org/en/latest/api/ |
| dol | DOL APIs (OSHA Enforcement & DOL datasets) | U.S. Department of Labor | https://dataportal.dol.gov/ |
| eia | EIA Energy Data API (v2) | U.S. Energy Information Administration | https://www.eia.gov/opendata/documentation.php |
| fcc | FCC APIs (Broadband Map + License View) | Federal Communications Commission | https://us-fcc.app.box.com/v/bdc-public-data-api-spec |
| federal-register | Federal Register API | Office of the Federal Register / GPO | https://www.federalregister.gov/developers/documentation/api/v1 |
| govinfo | GovInfo API | U.S. Government Publishing Office | https://api.govinfo.gov/docs/ |
| nasa | NASA Open APIs | National Aeronautics and Space Administration | https://api.nasa.gov/ |
| nhtsa | NHTSA APIs (vPIC, Recalls, Safety Ratings, Complaints) | National Highway Traffic Safety Administration | https://vpic.nhtsa.dot.gov/api/ |
| openfda | openFDA API | Food and Drug Administration | https://open.fda.gov/apis/ |
| treasury-fiscal-data | Treasury Fiscal Data API | U.S. Department of the Treasury (Bureau of the Fiscal Service) | https://fiscaldata.treasury.gov/api-documentation/ |
| usgs-earthquake | USGS Earthquake Catalog API | U.S. Geological Survey | https://earthquake.usgs.gov/fdsnws/event/1/ |
| usgs-water | USGS Water Services (NWIS) | U.S. Geological Survey | https://waterservices.usgs.gov/docs/ |

## Descriptions

1. **cdc-open-data** — CDC public health datasets via the Socrata Open Data API: mortality, chronic disease, vaccination, surveillance.
2. **census-bureau** — American Community Survey, Decennial Census, and Population Estimates: demographics, income, housing, education by geography. (Note: overlaps with the live `census-acs` folder — scope before adding.)
3. **congress-gov** — Legislative data: bills, resolutions, amendments, members, committees, the Congressional Record, nominations, treaties from 1973 onward.
4. **data-gov** — Discovery catalog of 250k+ US government datasets across agencies (CKAN).
5. **dol** — Department of Labor datasets including OSHA enforcement/inspections, wage and hour (WHD) violations, MSHA mine safety, EBSA.
6. **eia** — US energy statistics: electricity prices/generation, petroleum, natural gas, coal, renewables, CO2 emissions, international energy.
7. **fcc** — Broadband availability/coverage (National Broadband Map / BDC), geography lookups (Area API), spectrum license search (License View).
8. **federal-register** — The daily journal of the US federal government: presidential documents, final/proposed rules, agency notices.
9. **govinfo** — Official publications from all three branches: Federal Register, CFR, US Code, public laws, bills, Congressional Record, court opinions, budget.
10. **nasa** — Family of NASA APIs: APOD, Near-Earth Objects, DONKI space weather, Mars rover photos, EPIC/Earth imagery, exoplanet archive.
11. **nhtsa** — Vehicle data: VIN decoding (vPIC), safety recalls, NCAP crash-test ratings, consumer complaints.
12. **openfda** — FDA data on drugs, devices, foods: adverse events, recalls, product labels, NDC directory.
13. **treasury-fiscal-data** — Federal financial data: national debt, daily Treasury statement, Treasury security interest rates, exchange rates, spending/revenue.
14. **usgs-earthquake** — Global earthquake event catalog (real-time and historical) via the FDSN event web service.
15. **usgs-water** — Real-time and historical US streamflow, gage height, and water-quality observations from USGS monitoring sites (NWIS).
