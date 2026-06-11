/**
 * Streamable HTTP transport for govdata-mcp (Vercel serverless function).
 *
 * Uses Vercel's official `mcp-handler` (formerly @vercel/mcp-adapter), which
 * wires the MCP Streamable HTTP transport to the Web-standard fetch signature
 * Vercel's Node runtime expects. Tool registration is the SAME code path as the
 * stdio entry: mcp-handler hands us an McpServer, and we register our handlers
 * on its underlying low-level Server via the shared registerTools().
 *
 * Stateless: no Redis configured, so SSE is disabled and each POST is a
 * self-contained JSON-RPC exchange — a good fit for short serverless invokes.
 *
 * Endpoint: POST  https://<deployment>/api/mcp   (basePath "/api" → "/api/mcp")
 *           Also reachable at /mcp via the rewrite in vercel.json.
 */
import { createMcpHandler } from "mcp-handler";
import { registerTools } from "../src/server.js";

const handler = createMcpHandler(
  (server) => {
    // server is an McpServer; register on its underlying low-level Server so we
    // reuse the exact stdio registration logic — no duplication.
    registerTools(server.server);
  },
  {
    serverInfo: { name: "govdata-mcp", version: "0.1.0" },
    // We register handlers on the low-level Server directly (not via
    // McpServer.tool()), so declare the tools capability explicitly — otherwise
    // the SDK rejects tools/list with "Server does not support tools".
    capabilities: { tools: {} },
  },
  { basePath: "/api", disableSse: true, maxDuration: 30 },
);

export { handler as GET, handler as POST, handler as DELETE };
export default handler;
