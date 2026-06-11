import { CATALOG } from "../data/catalog.js";

/**
 * Free discovery tool (Tier 1). Returns the static directory of data categories
 * so an agent can learn what's available, each source's tier, upstream base URL,
 * schema notes, and an example native query — before committing to a query.
 */
export const DISCOVERY_TOOL_NAME = "discover_data_sources";

export const DISCOVERY_TOOL_DESCRIPTION = `List every government/public-data source available through this gateway. FREE, no cost. Call this first to discover what data you can query and how.

Returns an array of categories, each with:
- id: pass this as connectorId to the query tool.
- name: human-readable label.
- tier: "free" (queryable now, unmetered) or "premium" (Tier 2, payment-gated — querying returns a 402 until billing is enabled).
- upstreamBaseUrl: the underlying government API this source proxies (raw passthrough — no normalization).
- schemaNotes: the shape of the upstream response and how to query it.
- exampleNativeQuery: a concrete query you can adapt.
- connectorImplemented: true if it can be queried right now; false = directory listing only.

After discovery, use the query tool with the chosen id and a raw query matching that upstream API.`;

export interface DiscoveryResult {
  count: number;
  sources: typeof CATALOG;
}

export function runDiscovery(): DiscoveryResult {
  return {
    count: CATALOG.length,
    sources: CATALOG,
  };
}
