/**
 * Public read-only catalog endpoint (Vercel serverless function).
 *
 * Serves the generated source catalog as JSON — the single source of truth for
 * the website. The catalog is codegen'd from sources/<id>/source.json into
 * src/catalog/catalog.generated.ts, so this endpoint stays in sync with the
 * sources/ tree automatically (regenerate with `npm run catalog`).
 *
 * Public data: permissive CORS, short cache. GET only.
 *
 * Endpoint: GET https://<deployment>/api/catalog
 *
 * Uses the same Web-standard fetch handler signature as api/mcp.ts so Vercel's
 * @vercel/node builder treats it as a fetch-style function (named method export)
 * rather than a legacy (req, res) handler.
 */
import { SOURCES } from "../src/catalog/catalog.generated.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Project the full validated spec down to the public, site-facing fields only.
// Internal fields (auth credentialRef, limits, compliance, meta) stay private.
function toPublic(s: (typeof SOURCES)[number]) {
  return {
    id: s.id,
    name: s.name,
    agency: s.agency,
    category: s.category,
    tier: s.tier,
    status: s.status,
    api: {
      baseUrl: s.api.baseUrl,
      docsUrl: s.api.docsUrl,
    },
    llmDocs: {
      summary: s.llmDocs.summary,
      exampleQueries: s.llmDocs.exampleQueries,
    },
    pricing: s.pricing,
  };
}

function GET(): Response {
  const body = {
    count: SOURCES.length,
    sources: SOURCES.map(toPublic),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...CORS,
    },
  });
}

function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export { GET, OPTIONS };
