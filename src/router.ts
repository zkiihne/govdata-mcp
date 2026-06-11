import { getCatalogEntry } from "./data/catalog.js";
import type { Connector, ExecuteResult, RawQuery } from "./connectors/types.js";
import { noaaConnector } from "./connectors/noaa.js";

/**
 * Registry of implemented connectors, keyed by id. As new connectors are wired,
 * import and add them here (and flip connectorImplemented in the catalog).
 */
const CONNECTORS: Record<string, Connector> = {
  [noaaConnector.id]: noaaConnector,
};

/** 402-style error object returned for premium connectors until metering lands. */
export interface PaymentRequiredError {
  code: 402;
  message: string;
  connectorId: string;
  balance_url: string;
}

/** Error returned when the connector id is unknown or not yet implemented. */
export interface RouteError {
  code: 404 | 501;
  message: string;
  connectorId: string;
}

export type RouteResult = ExecuteResult | PaymentRequiredError | RouteError;

export function isPaymentRequired(r: RouteResult): r is PaymentRequiredError {
  return (r as PaymentRequiredError).code === 402;
}

export function isRouteError(r: RouteResult): r is RouteError {
  const code = (r as RouteError).code;
  return code === 404 || code === 501;
}

/**
 * Route a raw query to its connector.
 * - Unknown id            → 404 RouteError.
 * - Premium tier          → stubbed 402 PaymentRequiredError (no metering yet).
 * - Free, not implemented → 501 RouteError (catalog entry exists, no connector).
 * - Free, implemented     → upstream raw passthrough via connector.execute().
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

  if (entry.tier === "premium") {
    return {
      code: 402,
      message: `Connector "${connectorId}" is a premium (Tier 2) data source and requires payment. Metering is not yet enabled.`,
      connectorId,
      balance_url: "TBD",
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

  return connector.execute(rawQuery);
}

export { CONNECTORS };
