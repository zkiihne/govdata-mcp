import { getCatalogEntry } from "./data/catalog.js";
import type { Connector, ExecuteResult, RawQuery } from "./connectors/types.js";
import { MissingCredentialError } from "./connectors/inject.js";
import { noaaConnector } from "./connectors/noaa.js";
import { usaspendingConnector } from "./connectors/usaspending.js";
import { secEdgarConnector } from "./connectors/sec-edgar.js";
import { censusAcsConnector } from "./connectors/census-acs.js";
import { blsConnector } from "./connectors/bls.js";
import { fredConnector } from "./connectors/fred.js";
import { epaAirnowConnector } from "./connectors/epa-airnow.js";
import { noaaClimateConnector } from "./connectors/noaa-climate.js";
import { femaOpenConnector } from "./connectors/fema-open.js";
import { clinicalTrialsConnector } from "./connectors/clinical-trials.js";
import { treasuryFiscalConnector } from "./connectors/treasury-fiscal.js";
import { usgsEarthquakeConnector } from "./connectors/usgs-earthquake.js";
import { fdicBankfindConnector } from "./connectors/fdic-bankfind.js";
import { federalRegisterConnector } from "./connectors/federal-register.js";
import { beaConnector } from "./connectors/bea.js";
import { congressGovConnector } from "./connectors/congress-gov.js";
import { eiaConnector } from "./connectors/eia.js";
import { nvdConnector } from "./connectors/nvd.js";
import { openfdaConnector } from "./connectors/openfda.js";
import { regulationsGovConnector } from "./connectors/regulations-gov.js";

/**
 * Registry of implemented connectors, keyed by id. As new connectors are wired,
 * import and add them here (and flip connectorImplemented in the catalog).
 */
const CONNECTORS: Record<string, Connector> = {
  [noaaConnector.id]: noaaConnector,
  [usaspendingConnector.id]: usaspendingConnector,
  [secEdgarConnector.id]: secEdgarConnector,
  [censusAcsConnector.id]: censusAcsConnector,
  [blsConnector.id]: blsConnector,
  [fredConnector.id]: fredConnector,
  [epaAirnowConnector.id]: epaAirnowConnector,
  [noaaClimateConnector.id]: noaaClimateConnector,
  [femaOpenConnector.id]: femaOpenConnector,
  [clinicalTrialsConnector.id]: clinicalTrialsConnector,
  [treasuryFiscalConnector.id]: treasuryFiscalConnector,
  [usgsEarthquakeConnector.id]: usgsEarthquakeConnector,
  [fdicBankfindConnector.id]: fdicBankfindConnector,
  [federalRegisterConnector.id]: federalRegisterConnector,
  [beaConnector.id]: beaConnector,
  [congressGovConnector.id]: congressGovConnector,
  [eiaConnector.id]: eiaConnector,
  [nvdConnector.id]: nvdConnector,
  [openfdaConnector.id]: openfdaConnector,
  [regulationsGovConnector.id]: regulationsGovConnector,
};

/**
 * Error returned when the connector id is unknown (404), listed but not yet
 * implemented (501), or implemented but missing its BYOK credential (503).
 */
export interface RouteError {
  code: 404 | 501 | 503;
  message: string;
  connectorId: string;
}

export type RouteResult = ExecuteResult | RouteError;

export function isRouteError(r: RouteResult): r is RouteError {
  const code = (r as RouteError).code;
  return code === 404 || code === 501 || code === 503;
}

/**
 * Route a raw query to its connector. Everything is free; keyed connectors are
 * bring-your-own-key (the key is read from env per the source's auth block).
 * - Unknown id          → 404 RouteError.
 * - Not implemented     → 501 RouteError (catalog entry exists, no connector).
 * - Implemented         → upstream raw passthrough via connector.execute().
 * - Missing BYOK key    → 503 RouteError (connector wired, env var unset).
 */
export async function route(
  connectorId: string,
  rawQuery: RawQuery,
): Promise<RouteResult> {
  const entry = getCatalogEntry(connectorId);
  if (!entry) {
    return {
      code: 404,
      message: `Unknown connector id "${connectorId}". Call the discovery tool to list available data sources.`,
      connectorId,
    };
  }

  const connector = CONNECTORS[connectorId];
  if (!connector) {
    return {
      code: 501,
      message: `Connector "${connectorId}" is listed in the catalog but not yet implemented.`,
      connectorId,
    };
  }

  try {
    return await connector.execute(rawQuery);
  } catch (err) {
    if (err instanceof MissingCredentialError) {
      return {
        code: 503,
        message: `Connector "${connectorId}" requires an API key that is not set (${err.credentialRef}). This is a bring-your-own-key source: set the environment variable and retry. Call the auth_status tool to see where to get the key.`,
        connectorId,
      };
    }
    throw err;
  }
}

export { CONNECTORS };
