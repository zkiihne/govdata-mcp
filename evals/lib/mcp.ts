import type { AnthropicTool } from "./anthropic.js";

/**
 * Live-prod MCP JSON-RPC client. Talks to the deployed gateway over HTTP POST;
 * responses are SSE-framed (`event: message\ndata: {json}\n\n`), so we parse the
 * `data:` line. Calls are stateless — no initialize/session handshake needed.
 */

/** Live production endpoint. NOT local — every tool call hits the deployed gateway. */
export const MCP_URL = "https://govdata-mcp.vercel.app/api/mcp";

let nextId = 1;

interface JsonRpcResponse {
  result?: any;
  error?: { code: number; message: string };
}

/** POST a JSON-RPC request and parse the SSE-framed `data:` payload. */
async function rpc(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, ...(params ? { params } : {}) }),
  });
  const text = await res.text();
  // SSE: take the line beginning with "data:" and JSON.parse the remainder.
  const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
  if (!dataLine) {
    // Some hosts return bare JSON; try that before giving up.
    try {
      return JSON.parse(text) as JsonRpcResponse;
    } catch {
      throw new Error(`MCP ${method}: no SSE data line in response: ${text.slice(0, 300)}`);
    }
  }
  return JSON.parse(dataLine.slice("data:".length).trim()) as JsonRpcResponse;
}

/** Raw MCP tool definition as returned by tools/list. */
export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Fetch the production tool list verbatim (exact descriptions + schemas). */
export async function listTools(): Promise<McpToolDef[]> {
  const r = await rpc("tools/list");
  if (r.error) throw new Error(`tools/list error: ${r.error.message}`);
  return r.result.tools as McpToolDef[];
}

/** Convert prod MCP tool defs → Anthropic tool format (description used verbatim). */
export function toAnthropicTools(defs: McpToolDef[]): AnthropicTool[] {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.inputSchema,
  }));
}

/**
 * Execute a tool against prod. Returns the tool result text (the gateway puts
 * its payload in result.content[0].text — a JSON string for query_data_source).
 * Transport-level failures are surfaced as { errored: true }.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; errored: boolean }> {
  try {
    const r = await rpc("tools/call", { name, arguments: args });
    if (r.error) {
      return { text: `MCP error: ${r.error.message}`, errored: true };
    }
    const block = r.result?.content?.[0];
    const text = typeof block?.text === "string" ? block.text : JSON.stringify(r.result);
    return { text, errored: r.result?.isError === true };
  } catch (e) {
    return { text: `transport error: ${(e as Error).message}`, errored: true };
  }
}
