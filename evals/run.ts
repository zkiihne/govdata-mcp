import { readdir, readFile, mkdir, writeFile, rm, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callMessages, textOf } from "./lib/anthropic.js";
import { listTools, toAnthropicTools, callTool } from "./lib/mcp.js";
import { runCase } from "./runner.js";
import { gradeCase } from "./grader.js";
import type { Case, CaseResult } from "./lib/types.js";

/**
 * CLI entry for the eval harness — INCREMENTAL runner.
 *
 * Loads cases from evals/cases/*.json, splits them into per-source batches, and
 * runs each case through the blind-agent runner then the grader. Crucially, each
 * case's full result (transcript + grade) is written to
 *   evals/results/<run-id>/cases/<case-id>.json
 * IMMEDIATELY after it completes, so a crash mid-run loses at most the one
 * in-flight case. A `.pending` marker is written before each case and removed on
 * completion, so a resumed run can tell what was interrupted.
 *
 * The scoreboard (results.json + summary.md) is produced by a SEPARATE step:
 *   npm run eval:collect -- <run-id>
 *
 * Flags:
 *   --source=<id>     run only cases for one source (sourceId match OR id prefix)
 *   --batch=<n>       run only the nth per-source batch (1-based, sorted by source)
 *   --case=<id>       run only one case
 *   --limit=<n>       cap number of cases (applied after other filters)
 *   --run-id=<id>     write into an existing run dir instead of a fresh timestamp
 *   --resume=<id>     resume a run: reuse its dir AND skip cases already having a
 *                     result file (implies --run-id). Also accepts: --resume <id>
 *   --list-batches    print the per-source batch plan and exit (no API calls)
 *   --selftest        plumbing check only (no eval)
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(HERE, "cases");
const RESULTS_DIR = join(HERE, "results");

interface Flags {
  source?: string;
  batch?: number;
  limit?: number;
  caseId?: string;
  runId?: string;
  resume?: string;
  listBatches: boolean;
  selftest: boolean;
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = { selftest: false, listBatches: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--selftest") f.selftest = true;
    else if (a === "--list-batches") f.listBatches = true;
    else if (a.startsWith("--source=")) f.source = a.slice("--source=".length);
    else if (a.startsWith("--batch=")) f.batch = Number(a.slice("--batch=".length));
    else if (a.startsWith("--limit=")) f.limit = Number(a.slice("--limit=".length));
    else if (a.startsWith("--case=")) f.caseId = a.slice("--case=".length);
    else if (a.startsWith("--run-id=")) f.runId = a.slice("--run-id=".length);
    else if (a.startsWith("--resume=")) f.resume = a.slice("--resume=".length);
    else if (a === "--resume") f.resume = argv[++i]; // space-separated form
  }
  return f;
}

/** Load and flatten every case array under evals/cases/*.json. */
async function loadCases(): Promise<Case[]> {
  let files: string[];
  try {
    files = (await readdir(CASES_DIR)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const cases: Case[] = [];
  for (const f of files.sort()) {
    const raw = await readFile(join(CASES_DIR, f), "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) cases.push(...arr);
  }
  return cases;
}

function applyFilters(cases: Case[], f: Flags): Case[] {
  let out = cases;
  if (f.caseId) out = out.filter((c) => c.id === f.caseId);
  if (f.source) out = out.filter((c) => c.sourceId === f.source || c.id.startsWith(f.source!));
  if (f.limit != null && Number.isFinite(f.limit)) out = out.slice(0, f.limit);
  return out;
}

/** Split cases into per-source batches, sorted by source id for stable indexing. */
interface Batch {
  source: string;
  cases: Case[];
}
function buildBatches(cases: Case[]): Batch[] {
  const map = new Map<string, Case[]>();
  for (const c of cases) {
    const arr = map.get(c.sourceId) ?? [];
    arr.push(c);
    map.set(c.sourceId, arr);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([source, cs]) => ({ source, cases: cs }));
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Plumbing check: tools/list + one Messages PONG + one prod tools/call. */
async function selftest(): Promise<void> {
  console.log("SELFTEST: agent-blind eval harness plumbing\n");

  console.log("1) MCP tools/list (prod)…");
  const defs = await listTools();
  console.log(`   ok — ${defs.length} tools: ${defs.map((d) => d.name).join(", ")}`);

  console.log("2) Messages API PONG (oauth)…");
  const resp = await callMessages({
    system: 'Reply with exactly the single word "PONG" and nothing else.',
    messages: [{ role: "user", content: "ping" }],
    maxTokens: 16,
  });
  const pong = textOf(resp);
  console.log(`   ok — model replied: ${JSON.stringify(pong)}`);

  console.log("3) MCP tools/call (prod) — discover_data_sources…");
  const tc = await callTool("discover_data_sources", {});
  let sourceCount = "?";
  try {
    const parsed = JSON.parse(tc.text);
    sourceCount = String(parsed.count ?? parsed.sources?.length ?? "?");
  } catch {
    /* leave as ? */
  }
  console.log(`   ok — errored=${tc.errored}, sources=${sourceCount}, len=${tc.text.length}`);

  const allPass = defs.length > 0 && /pong/i.test(pong) && !tc.errored;
  console.log(`\nSELFTEST ${allPass ? "PASSED" : "FAILED"}`);
  if (!allPass) process.exitCode = 1;
}

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Build the CaseResult for a crashed case (harness-level error). */
function crashResult(c: Case, e: Error): CaseResult {
  return {
    case: c,
    transcript: {
      caseId: c.id,
      intent: c.intent,
      sourceId: c.sourceId,
      assistantTurns: [],
      toolCalls: [],
      roundsUsed: 0,
      finalAnswer: "",
      error: e.message,
    },
    grade: {
      correctSource: false,
      firstQueryValid: false,
      attemptsToUsefulData: null,
      meetsCriteria: false,
      pass: false,
      failureCategory: "gave-up",
      notes: `Harness crash: ${e.message}`,
    },
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.selftest) {
    await selftest();
    return;
  }

  const allCases = await loadCases();
  const filtered = applyFilters(allCases, flags);
  let batches = buildBatches(filtered);

  // --batch=<n> selects a single 1-based batch from the sorted plan.
  if (flags.batch != null && Number.isFinite(flags.batch)) {
    const idx = flags.batch - 1;
    if (idx < 0 || idx >= batches.length) {
      console.error(`--batch=${flags.batch} out of range (1..${batches.length}).`);
      process.exit(1);
    }
    batches = [batches[idx]!];
  }

  if (flags.listBatches) {
    console.log(`Batch plan (${batches.length} batches, ${filtered.length} cases):\n`);
    batches.forEach((b, i) => {
      console.log(`  [${i + 1}] ${b.source} — ${b.cases.length} case(s): ${b.cases.map((c) => c.id).join(", ")}`);
    });
    return;
  }

  console.log("Fetching production tools (tools/list)…");
  const defs = await listTools();
  const tools = toAnthropicTools(defs);
  console.log(`Loaded ${tools.length} prod tools: ${tools.map((t) => t.name).join(", ")}`);

  const plannedCases = batches.reduce((n, b) => n + b.cases.length, 0);
  console.log(`Running ${plannedCases} of ${allCases.length} case(s) across ${batches.length} batch(es).\n`);

  if (plannedCases === 0) {
    console.log("No cases matched. (evals/cases/*.json may be empty — authored by other agents.)");
    return;
  }

  // Run id: resume > explicit run-id > fresh timestamp.
  const runId = flags.resume ?? flags.runId ?? ts();
  const runDir = join(RESULTS_DIR, runId);
  const casesDir = join(runDir, "cases");
  await mkdir(casesDir, { recursive: true });
  console.log(`Run id: ${runId}`);
  console.log(`Per-case results: ${casesDir}/\n`);

  let ran = 0;
  let skipped = 0;
  let done = 0;
  for (let bi = 0; bi < batches.length; bi++) {
    const b = batches[bi]!;
    console.log(`── batch ${bi + 1}/${batches.length}: ${b.source} (${b.cases.length} case(s)) ──`);
    for (let ci = 0; ci < b.cases.length; ci++) {
      const c = b.cases[ci]!;
      const resultPath = join(casesDir, `${c.id}.json`);
      const pendingPath = join(casesDir, `${c.id}.pending`);
      const tag = `${c.id}`;

      // Resume / idempotency: skip cases that already have a result file.
      if (await exists(resultPath)) {
        skipped++;
        console.log(`SKIP ${tag} (already has result)`);
        continue;
      }

      // Mark in-flight so a crash leaves a breadcrumb.
      await writeFile(
        pendingPath,
        JSON.stringify({ caseId: c.id, sourceId: c.sourceId, startedAt: new Date().toISOString() }, null, 2),
      );

      let result: CaseResult;
      try {
        const transcript = await runCase(c, tools);
        const grade = await gradeCase(transcript, c.successCriteria);
        result = { case: c, transcript, grade };
      } catch (e) {
        result = crashResult(c, e as Error);
      }

      // Persist the per-case result, then clear the pending marker.
      await writeFile(resultPath, JSON.stringify(result, null, 2));
      await rm(pendingPath, { force: true });

      ran++;
      if (result.grade.pass) done++;
      const mark = result.grade.pass ? "PASS" : "FAIL";
      const why = result.grade.pass ? "" : ` (${result.grade.failureCategory ?? "?"})`;
      console.log(`${mark} ${tag}${why}`);
    }
  }

  console.log(`\nDone: ran ${ran}, skipped ${skipped}, ${done}/${ran} passed this invocation.`);
  console.log(`Collect the scoreboard with:\n  npm run eval:collect -- ${runId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
