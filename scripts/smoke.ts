/**
 * stdio client smoke test + direct connector/injector assertions.
 *
 * MCP-routed (spawned server): tools/list, discovery, live NOAA-weather query,
 * live USAspending POST, live Census GET, a 501 not-implemented path (planned
 * source via router), and a 503 missing-BYOK-key path (fred without key).
 *
 * Direct (in-process imports): sec-edgar connector live, and injector
 * request-shape assertions for every key-required connector (key present ->
 * lands in the right place; key absent -> MissingCredentialError).
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
check("tools/list has discovery + auth_status + query", tools.tools.length === 3,
  tools.tools.map((t) => t.name).join(","));

const disc = JSON.parse(text((await client.callTool({ name: "discover_data_sources", arguments: {} })) as never));
check("discovery returns 22 sources", disc.count === 22, `count=${disc.count}`);
const statuses = Object.fromEntries(disc.sources.map((s: any) => [s.id, s.status]));
console.log("  statuses:", JSON.stringify(statuses));
check("usaspending live", statuses["usaspending"] === "live");
check("census-acs live", statuses["census-acs"] === "live");
check("sec-edgar live", statuses["sec-edgar"] === "live");
check("bls-public-data live", statuses["bls-public-data"] === "live");
// second-wave keyless six: live
check("fema-open live", statuses["fema-open"] === "live");
check("clinical-trials live", statuses["clinical-trials"] === "live");
check("treasury-fiscal live", statuses["treasury-fiscal"] === "live");
check("usgs-earthquake live", statuses["usgs-earthquake"] === "live");
check("fdic-bankfind live", statuses["fdic-bankfind"] === "live");
check("federal-register live", statuses["federal-register"] === "live");
// second-wave connectors now live (BYOK keys configured)
check("congress-gov live", statuses["congress-gov"] === "live");
check("openfda live", statuses["openfda"] === "live");
check("regulations-gov live", statuses["regulations-gov"] === "live");
// still-planned (no connector shipped)
check("usgs-water planned", statuses["usgs-water"] === "planned");

// ---- auth_status (BYOK) tool: keyed sources report their env vars ----
const authStatus = JSON.parse(text((await client.callTool({ name: "auth_status", arguments: {} })) as never));
check("auth_status lists keyed sources", Array.isArray(authStatus.sources) && authStatus.sources.length > 0,
  `keyed=${authStatus.sources?.length}`);
check("auth_status maps fred -> FRED_API_KEY",
  authStatus.sources?.find((s: any) => s.id === "fred")?.envVar === "FRED_API_KEY");

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

// ---- second-wave keyless six: live upstream calls ----
const fema = await call("fema-open", {
  path: "/v2/DisasterDeclarationsSummaries",
  params: { "$top": "1", "$orderby": "declarationDate desc" },
});
check("fema-open GET 200", fema.status === 200,
  `rows=${Array.isArray(fema?.data?.DisasterDeclarationsSummaries) ? fema.data.DisasterDeclarationsSummaries.length : "?"}`);

const ct = await call("clinical-trials", {
  path: "/studies",
  params: { "query.cond": "diabetes", fields: "NCTId,BriefTitle", pageSize: "1" },
});
check("clinical-trials GET 200", ct.status === 200,
  `studies=${Array.isArray(ct?.data?.studies) ? ct.data.studies.length : "?"}`);

const debt = await call("treasury-fiscal", {
  path: "/v2/accounting/od/debt_to_penny",
  params: { sort: "-record_date", "page[size]": "1" },
});
check("treasury-fiscal debt_to_penny 200", debt.status === 200,
  `debt=${debt?.data?.data?.[0]?.tot_pub_debt_out_amt ?? "?"}`);

const quake = await call("usgs-earthquake", {
  path: "/query",
  params: { format: "geojson", starttime: "2024-01-01", endtime: "2024-01-02", minmagnitude: "5" },
});
check("usgs-earthquake geojson 200", quake.status === 200,
  `features=${Array.isArray(quake?.data?.features) ? quake.data.features.length : "?"}`);

const fdic = await call("fdic-bankfind", {
  path: "/institutions",
  params: { filters: "STALP:CA", fields: "NAME,CITY,STALP", limit: "1" },
});
check("fdic-bankfind GET 200", fdic.status === 200,
  `total=${fdic?.data?.meta?.total ?? "?"}`);

const fedreg = await call("federal-register", {
  path: "/documents.json",
  params: { "conditions[term]": "privacy", per_page: "1" },
});
check("federal-register GET 200", fedreg.status === 200,
  `results=${Array.isArray(fedreg?.data?.results) ? fedreg.data.results.length : "?"}`);

// ---- regression: 501 not-implemented via router (planned source, no connector) ----
const planned501 = await call("usgs-water", { path: "/anything" });
check("usgs-water 501 via router", planned501.code === 501, `code=${planned501.code}`);

// ---- 503 missing-BYOK-key via router (fred, no key) ----
const prevFred = process.env.FRED_API_KEY;
delete process.env.FRED_API_KEY;
const fred503 = await call("fred", { path: "/series/observations", params: { series_id: "CPIAUCSL", file_type: "json" } });
check("fred 503 missing-credential via router", fred503.code === 503, `code=${fred503.code}`);
if (prevFred) process.env.FRED_API_KEY = prevFred;

await client.close();

// ================= direct, in-process =================

// sec-edgar connector live (keyless).
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
