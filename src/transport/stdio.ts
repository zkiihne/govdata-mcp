import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * stdio transport wiring. Kept isolated so an HTTP/Vercel transport
 * (src/transport/http.ts) can be added later without touching server logic.
 */
export async function startStdio(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP JSON-RPC channel and must stay clean.
  console.error("govdata-mcp: listening on stdio");
}
