# Eval Summary

Overall pass rate: **37/41 (90.2%)**

## Per-source

| source | cases | pass | mean attempts | top failure |
| --- | --- | --- | --- | --- |
| bea | 2 | 2/2 | 2.0 | — |
| bls-public-data | 2 | 1/2 | 1.0 | wrong-source (1) |
| census-acs | 3 | 3/3 | 1.3 | — |
| clinical-trials | 3 | 3/3 | 1.0 | — |
| congress-gov | 2 | 2/2 | 1.5 | — |
| eia | 2 | 2/2 | 3.0 | — |
| epa-airnow | 3 | 3/3 | 1.0 | — |
| fdic-bankfind | 2 | 2/2 | 1.0 | — |
| federal-register | 3 | 2/3 | 2.7 | gave-up (1) |
| fema-open | 2 | 2/2 | 1.0 | — |
| fred | 2 | 2/2 | 1.5 | — |
| noaa-climate | 2 | 2/2 | 2.5 | — |
| noaa-weather | 2 | 2/2 | 1.0 | — |
| nvd | 2 | 1/2 | 2.0 | bad-query-syntax (1) |
| openfda | 2 | 2/2 | 2.0 | — |
| treasury-fiscal | 2 | 2/2 | 1.0 | — |
| usaspending | 3 | 2/3 | 1.7 | bad-query-syntax (1) |
| usgs-earthquake | 2 | 2/2 | 1.0 | — |

## Failure categories

- bad-query-syntax: 2
- wrong-source: 1
- gave-up: 1

## Worst llmDocs offenders (lowest pass rate first)

Sources where the blind agent struggled most — fix these docs next.

| source | pass rate | cases | top failure |
| --- | --- | --- | --- |
| bls-public-data | 50% | 2 | wrong-source (1) |
| nvd | 50% | 2 | bad-query-syntax (1) |
| usaspending | 67% | 3 | bad-query-syntax (1) |
| federal-register | 67% | 3 | gave-up (1) |
| epa-airnow | 100% | 3 | — |
| census-acs | 100% | 3 | — |
| clinical-trials | 100% | 3 | — |
| bea | 100% | 2 | — |
| congress-gov | 100% | 2 | — |
| eia | 100% | 2 | — |
| fdic-bankfind | 100% | 2 | — |
| fema-open | 100% | 2 | — |
| fred | 100% | 2 | — |
| noaa-climate | 100% | 2 | — |
| noaa-weather | 100% | 2 | — |
| openfda | 100% | 2 | — |
| treasury-fiscal | 100% | 2 | — |
| usgs-earthquake | 100% | 2 | — |
