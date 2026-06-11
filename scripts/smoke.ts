/**
 * Minimal stdio client smoke test. Spawns the server, lists tools, calls the
 * discovery tool, and runs a live NOAA passthrough query. Prints raw output.
 *
 *   npx tsx scripts/smoke.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "src/index.ts"],
});

const client = new Client({ name: "govdata-smoke", version: "0.1.0" }, {});

function text(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content.map((c) => c.text ?? "").join("\n");
}

await client.connect(transport);

console.log("=== tools/list ===");
const tools = await client.listTools();
console.log(tools.tools.map((t) => `- ${t.name}`).join("\n"));

console.log("\n=== discover_data_sources ===");
const disc = await client.callTool({ name: "discover_data_sources", arguments: {} });
console.log(text(disc as never));

console.log("\n=== query_data_source noaa /points/39.7456,-104.9903 ===");
const points = await client.callTool({
  name: "query_data_source",
  arguments: { connectorId: "noaa", path: "/points/39.7456,-104.9903" },
});
const pointsText = text(points as never);
console.log(pointsText.slice(0, 600));

// Follow the passthrough chain: pull the forecast gridpoint URL and query it.
try {
  const parsed = JSON.parse(pointsText);
  const forecastUrl: string | undefined = parsed?.data?.properties?.forecast;
  if (forecastUrl) {
    const path = new URL(forecastUrl).pathname;
    console.log(`\n=== query_data_source noaa ${path} ===`);
    const fc = await client.callTool({
      name: "query_data_source",
      arguments: { connectorId: "noaa", path },
    });
    const fcParsed = JSON.parse(text(fc as never));
    const first = fcParsed?.data?.properties?.periods?.[0];
    console.log("first period:", JSON.stringify(first, null, 2));
  }
} catch (e) {
  console.error("follow-up query failed:", e);
}

console.log("\n=== premium 402 stub (sec-filings) ===");
const sec = await client.callTool({
  name: "query_data_source",
  arguments: { connectorId: "sec-filings", path: "/submissions/CIK0000320193.json" },
});
console.log(text(sec as never));

await client.close();
process.exit(0);
