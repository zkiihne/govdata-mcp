/**
 * HTTP smoke test for the Streamable HTTP transport.
 *
 * Drives the exported Vercel handler (api/mcp.ts) directly using Web-standard
 * Request objects — no server process needed. Pass a base URL as argv[2] to hit
 * a live deployment instead (e.g. `tsx scripts/smoke-http.ts https://foo/api/mcp`).
 */
import localHandler from "../api/mcp.js";

const BASE = process.argv[2]; // e.g. https://<deployment>/api/mcp

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

async function call(body: unknown): Promise<unknown> {
  const init: RequestInit = {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  };
  let res: Response;
  if (BASE) {
    res = await fetch(BASE, init);
  } else {
    res = await localHandler(new Request("http://local/api/mcp", init));
  }
  const text = await res.text();
  // Streamable HTTP may answer JSON or an SSE frame ("event: message\ndata: {...}").
  const jsonLine =
    text.startsWith("event:") || text.includes("\ndata:")
      ? text.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim() ?? text
      : text;
  try {
    return { status: res.status, body: JSON.parse(jsonLine) };
  } catch {
    return { status: res.status, body: text };
  }
}

function rpc(id: number, method: string, params: unknown = {}) {
  return { jsonrpc: "2.0", id, method, params };
}

async function main() {
  console.log(`[smoke-http] target: ${BASE ?? "local handler (api/mcp.ts)"}\n`);

  console.log("1) initialize");
  console.log(
    JSON.stringify(
      await call(
        rpc(1, "initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "smoke-http", version: "0.0.0" },
        }),
      ),
      null,
      2,
    ),
  );

  console.log("\n2) tools/list");
  console.log(JSON.stringify(await call(rpc(2, "tools/list")), null, 2));

  console.log("\n3) discover_data_sources");
  console.log(
    JSON.stringify(
      await call(
        rpc(3, "tools/call", {
          name: "discover_data_sources",
          arguments: {},
        }),
      ),
      null,
      2,
    ),
  );

  console.log("\n4) query_data_source noaa (LIVE passthrough)");
  console.log(
    JSON.stringify(
      await call(
        rpc(4, "tools/call", {
          name: "query_data_source",
          arguments: { connectorId: "noaa", path: "/points/39.7456,-104.9903" },
        }),
      ),
      null,
      2,
    ),
  );

  console.log("\n5) query_data_source sec-filings (premium 402 stub)");
  console.log(
    JSON.stringify(
      await call(
        rpc(5, "tools/call", {
          name: "query_data_source",
          arguments: { connectorId: "sec-filings", path: "/" },
        }),
      ),
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
