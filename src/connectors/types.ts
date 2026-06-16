/**
 * Connector contract.
 *
 * A connector is a thin, raw-passthrough adapter over a single upstream
 * government/public-data API. It does NOT normalize responses — whatever the
 * upstream returns is forwarded verbatim. The value GovData adds is discovery,
 * LLM-optimized docs, and credential injection (bring-your-own-key via env).
 */

/** What a connector reports about itself for routing + tool descriptions. */
export interface ConnectorDescription {
  /** Stable id, matches the catalog entry id (e.g. "noaa"). */
  id: string;
  /** Human/LLM-facing name. */
  name: string;
  /** Base URL of the upstream API this connector proxies. */
  upstreamBaseUrl: string;
  /**
   * LLM-optimized description: endpoint patterns, parameter formats, example
   * queries, and common errors. This string is surfaced to calling agents, so
   * it must teach the agent how to drive the upstream API. See
   * docs/llm-doc-style-guide.md.
   */
  description: string;
}

/**
 * Result of an execute() call. Raw passthrough: `data` is the upstream body
 * exactly as returned (parsed JSON when the upstream is JSON, otherwise text).
 */
export interface ExecuteResult {
  status: number;
  /** Upstream response body, unmodified. */
  data: unknown;
  /** Upstream content-type, for callers that need to disambiguate. */
  contentType?: string;
}

/**
 * A raw query is whatever the upstream API expects, expressed as a path +
 * optional query params / method / body. The connector forwards it verbatim;
 * it does not invent its own query language.
 */
export interface RawQuery {
  /** Path appended to the connector's upstreamBaseUrl, e.g. "/points/39.7,-104.9". */
  path: string;
  /**
   * Optional querystring params, passed through unchanged. A value may be a
   * single string or an array of strings; arrays serialize as repeated keys
   * (e.g. `fields[]=title&fields[]=publication_date`).
   */
  params?: Record<string, string | string[]>;
  /** HTTP method, defaults to GET. */
  method?: string;
  /** Optional request body for non-GET methods, forwarded verbatim. */
  body?: unknown;
}

export interface Connector {
  readonly id: string;
  /** Static self-description for discovery + tool docs. */
  describe(): ConnectorDescription;
  /** Forward the raw query to the upstream API and return the raw response. */
  execute(rawQuery: RawQuery): Promise<ExecuteResult>;
}
