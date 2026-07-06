# Eval Summary

Overall pass rate: **10/10 (100.0%)**

> Partial run — 31 case(s) not yet run (excluded from rate).

## Per-source

| source | cases | pass | mean attempts | top failure |
| --- | --- | --- | --- | --- |
| bls-public-data | 2 | 2/2 | 1.0 | — |
| federal-register | 3 | 3/3 | 1.3 | — |
| nvd | 2 | 2/2 | 1.0 | — |
| usaspending | 3 | 3/3 | 2.0 | — |

## Token usage & cost

| phase | input tokens | output tokens | est. cost |
| --- | --- | --- | --- |
| agent | 894,092 | 15,897 | $2.9207 |
| grader | 44,435 | 2,640 | $0.1729 |
| **total** | **938,527** | **18,537** | **$3.0936** |

Mean cost per case: $0.3094 (over 10 case(s)). Pricing: Sonnet 4.6 @ $3/1M input, $15/1M output.

## Failure categories

None — all graded cases passed.

## Worst llmDocs offenders (lowest pass rate first)

Sources where the blind agent struggled most — fix these docs next.

| source | pass rate | cases | top failure |
| --- | --- | --- | --- |
| federal-register | 100% | 3 | — |
| usaspending | 100% | 3 | — |
| bls-public-data | 100% | 2 | — |
| nvd | 100% | 2 | — |

## Not run

31 case(s) have no result file yet:

- bea-01 (bea)
- bea-02 (bea)
- census-acs-01 (census-acs)
- census-acs-02 (census-acs)
- clinical-trials-01 (clinical-trials)
- clinical-trials-02 (clinical-trials)
- congress-gov-01 (congress-gov)
- congress-gov-02 (congress-gov)
- eia-01 (eia)
- eia-02 (eia)
- epa-airnow-01 (epa-airnow)
- epa-airnow-02 (epa-airnow)
- fdic-bankfind-01 (fdic-bankfind)
- fdic-bankfind-02 (fdic-bankfind)
- fema-open-01 (fema-open)
- fema-open-02 (fema-open)
- fred-01 (fred)
- fred-02 (fred)
- noaa-climate-01 (noaa-climate)
- noaa-climate-02 (noaa-climate)
- noaa-weather-01 (noaa-weather)
- noaa-weather-02 (noaa-weather)
- openfda-01 (openfda)
- openfda-02 (openfda)
- routing-air-quality-denver (epa-airnow)
- routing-alzheimers-trials (clinical-trials)
- routing-median-income-city (census-acs)
- treasury-fiscal-01 (treasury-fiscal)
- treasury-fiscal-02 (treasury-fiscal)
- usgs-earthquake-01 (usgs-earthquake)
- usgs-earthquake-02 (usgs-earthquake)
