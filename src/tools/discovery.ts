import { CATALOG } from "../data/catalog.js";
import type { SourceSpec } from "../catalog/schema.js";

/**
 * Free discovery tool (Tier 1). Serves the generated source catalog so an agent
 * can learn what's available — each source's tier, status, agency, upstream API
 * (base URL + endpoints), and full LLM docs — before committing to a query.
 *
 * Planned sources ARE listed: they're a free roadmap signal. `status` tells the
 * agent whether a source is queryable now ("live") or directory-only.
 */
export const DISCOVERY_TOOL_NAME = "discover_data_sources";

export const DISCOVERY_TOOL_DESCRIPTION = `List every government/public-data source available through this gateway. FREE, no cost. Call this first to discover what data you can query and how.

Returns an array of sources, each with:
- id: pass this as connectorId to the query tool.
- name / agency / category: what it is and who publishes it.
- tier: "free" (queryable now, unmetered) or "premium" (payment-gated — querying returns a 402 until billing is enabled).
- status: "live" = queryable now; "planned"/"testing" = listed for roadmap, querying returns 501 until the connector ships.
- api: { baseUrl, protocol, docsUrl, endpoints[] } — the underlying government API this source proxies (raw passthrough, no normalization).
- llmDocs: { summary, queryGuide, exampleQueries[], gotchas[] } — how to actually drive the upstream API.
- auth / limits / pricing / compliance: how the source is accessed and governed.

After discovery, use the query tool with the chosen id and a raw query matching that upstream API.`;

export interface DiscoveryResult {
  count: number;
  sources: readonly SourceSpec[];
}

export function runDiscovery(): DiscoveryResult {
  return {
    count: CATALOG.length,
    sources: CATALOG,
  };
}
