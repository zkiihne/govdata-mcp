/**
 * Streamable HTTP transport for govdata-mcp (Vercel serverless function).
 *
 * Remote MCP endpoint. Reuses the shared createServer() so tool registration is
 * identical to the stdio entry (src/index.ts) — no duplicated logic.
 *
 * Stateless mode: a fresh Server + transport are created per request
 * (sessionIdGenerator: undefined). enableJsonResponse returns plain JSON-RPC
 * responses instead of opening an SSE stream, which suits short-lived
 * serverless invocations. Good enough until metering/sessions are needed.
 *
 * Endpoint: POST/GET/DELETE  https://<deployment>/api/mcp  (also /mcp via rewrite)
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "../src/server.js";

export const config = { runtime: "nodejs" };

async function handler(request: Request): Promise<Response> {
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  await server.connect(transport);
  // Stateless: the server/transport are per-request and torn down with the
  // serverless invocation, so we don't close them here (closing could abort a
  // response body that the runtime is still reading).
  return transport.handleRequest(request);
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export default handler;
