/**
 * stdio client smoke test + direct connector/injector assertions.
 *
 * MCP-routed (spawned server): tools/list, discovery, live NOAA-weather query,
 * live USAspending POST, live Census GET, premium 402 (sec-edgar via router),
 * and a 503 missing-credential path (fred without key).
 *
 * Direct (in-process imports): sec-edgar connector live (bypassing the 402
 * gate), and injector request-shape assertions for every key-required connector
 * (key present -> lands in the right place; key absent -> MissingCredentialError).
 *
 *   npx tsx scripts/smoke.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { injectAuth, MissingCredentialError } from "../src/connectors/inject.js";
import { getSource } from "../src/data/catalog.js";
import { secEdgarConnector } from "../src/connectors/sec-edgar.js";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "src/cli.ts"],
});
const client = new Client({ name: "govdata-smoke", version: "0.1.0" }, {});

function text(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content.map((c) => c.text ?? "").join("\n");
}
async function call(connectorId: string, args: Record<string, unknown>) {
  const res = await client.callTool({
    name: "query_data_source",
    arguments: { connectorId, ...args },
  });
  return JSON.parse(text(res as never));
}

await client.connect(transport);

// ---- tools/list + discovery ----
const tools = await client.listTools();
check("tools/list has discovery + query", tools.tools.length === 2,
  tools.tools.map((t) => t.name).join(","));

const disc = JSON.parse(text((await client.callTool({ name: "discover_data_sources", arguments: {} })) as never));
check("discovery returns 8 sources", disc.count === 8, `count=${disc.count}`);
const statuses = Object.fromEntries(disc.sources.map((s: any) => [s.id, `${s.tier}/${s.status}`]));
console.log("  statuses:", JSON.stringify(statuses));
check("usaspending live", statuses["usaspending"] === "free/live");
check("census-acs live", statuses["census-acs"] === "free/live");
check("sec-edgar premium/live", statuses["sec-edgar"] === "premium/live");
check("bls testing", statuses["bls-public-data"] === "free/testing");

// ---- regression: NOAA weather live (two-step) ----
const pts = await call("noaa-weather", { path: "/points/39.7456,-104.9903" });
check("noaa-weather /points 200", pts.status === 200, `status=${pts.status}`);
const fcUrl = pts?.data?.properties?.forecast;
if (fcUrl) {
  const fc = await call("noaa-weather", { path: new URL(fcUrl).pathname });
  check("noaa-weather forecast 200", fc.status === 200,
    `first="${fc?.data?.properties?.periods?.[0]?.shortForecast}"`);
}

// ---- keyless live: USAspending POST ----
const usa = await call("usaspending", {
  path: "/search/spending_by_award/",
  method: "POST",
  body: { filters: { award_type_codes: ["A","B","C","D"], time_period: [{ start_date: "2023-10-01", end_date: "2024-09-30" }] }, fields: ["Award ID","Recipient Name","Award Amount"], limit: 5 },
});
check("usaspending POST 200", usa.status === 200,
  `results=${Array.isArray(usa?.data?.results) ? usa.data.results.length : "?"}`);

// ---- keyless live: Census GET (works without key) ----
const cen = await call("census-acs", {
  path: "/2022/acs/acs5",
  params: { get: "NAME,B01001_001E", for: "state:*" },
});
check("census-acs GET 200 (keyless)", cen.status === 200,
  `rows=${Array.isArray(cen?.data) ? cen.data.length : "?"}`);

// ---- regression: premium 402 via router (sec-edgar) ----
const sec402 = await call("sec-edgar", { path: "/submissions/CIK0000320193.json" });
check("sec-edgar 402 via router", sec402.code === 402, `code=${sec402.code}`);

// ---- 503 missing-credential via router (fred, no key) ----
const prevFred = process.env.FRED_API_KEY;
delete process.env.FRED_API_KEY;
const fred503 = await call("fred", { path: "/series/observations", params: { series_id: "CPIAUCSL", file_type: "json" } });
check("fred 503 missing-credential via router", fred503.code === 503, `code=${fred503.code}`);
if (prevFred) process.env.FRED_API_KEY = prevFred;

await client.close();

// ================= direct, in-process =================

// sec-edgar connector live, bypassing the 402 router gate.
const secDirect = await secEdgarConnector.execute({ path: "/submissions/CIK0000320193.json" });
check("sec-edgar connector direct 200", secDirect.status === 200,
  `name="${(secDirect.data as any)?.name}"`);

// Injector request-shape assertions per key-required source.
const KEY_SOURCES: Array<{ id: string; env: string; placement: string; param: string }> = [
  { id: "bls-public-data", env: "BLS_API_KEY",   placement: "body",   param: "registrationkey" },
  { id: "fred",            env: "FRED_API_KEY",   placement: "query",  param: "api_key" },
  { id: "epa-airnow",      env: "AIRNOW_API_KEY", placement: "query",  param: "API_KEY" },
  { id: "noaa-climate",    env: "NOAA_CDO_TOKEN", placement: "header", param: "token" },
];

for (const k of KEY_SOURCES) {
  const auth = getSource(k.id)!.auth;
  const prev = process.env[k.env];

  // key present -> lands at the right place
  process.env[k.env] = "TESTKEY123";
  const url = new URL("https://example.gov/x");
  const headers: Record<string, string> = {};
  const body: Record<string, unknown> = {};
  injectAuth(auth, { url, headers, body });
  let placed = false;
  if (k.placement === "query") placed = url.searchParams.get(k.param) === "TESTKEY123";
  if (k.placement === "header") placed = headers[k.param] === "TESTKEY123";
  if (k.placement === "body") placed = body[k.param] === "TESTKEY123";
  check(`inject ${k.id} -> ${k.placement}:${k.param}`, placed);

  // key absent -> MissingCredentialError (clear, not a crash)
  delete process.env[k.env];
  let threw: unknown;
  try { injectAuth(auth, { url: new URL("https://example.gov/x"), headers: {}, body: {} }); }
  catch (e) { threw = e; }
  check(`inject ${k.id} missing-key error`,
    threw instanceof MissingCredentialError,
    threw instanceof Error ? threw.message : String(threw));

  if (prev !== undefined) process.env[k.env] = prev;
}

console.log(`\n${failures === 0 ? "✓ ALL PASS" : "✗ " + failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
