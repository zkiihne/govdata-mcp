import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callMessages, textOf } from "./lib/anthropic.js";
import { listTools, toAnthropicTools, callTool } from "./lib/mcp.js";
import { runCase } from "./runner.js";
import { gradeCase } from "./grader.js";
import type { Case, CaseResult } from "./lib/types.js";

/**
 * CLI entry for the eval harness. Loads cases from evals/cases/*.json, runs each
 * through the blind-agent runner then the grader, writes results + a scoreboard,
 * and prints per-case progress.
 *
 * Flags: --source=<id> (sourceId match OR case-id prefix), --limit=<n>,
 * --case=<id>, --selftest (plumbing check only, no eval).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(HERE, "cases");
const RESULTS_DIR = join(HERE, "results");

interface Flags {
  source?: string;
  limit?: number;
  caseId?: string;
  selftest: boolean;
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = { selftest: false };
  for (const a of argv) {
    if (a === "--selftest") f.selftest = true;
    else if (a.startsWith("--source=")) f.source = a.slice("--source=".length);
    else if (a.startsWith("--limit=")) f.limit = Number(a.slice("--limit=".length));
    else if (a.startsWith("--case=")) f.caseId = a.slice("--case=".length);
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

/** Build the markdown scoreboard from results. */
function buildSummary(results: CaseResult[]): string {
  const total = results.length;
  const passed = results.filter((r) => r.grade.pass).length;
  const rate = total ? ((passed / total) * 100).toFixed(1) : "0.0";

  // Per-source aggregation.
  interface Agg {
    cases: number;
    pass: number;
    attempts: number[];
    failures: Record<string, number>;
  }
  const bySource = new Map<string, Agg>();
  const failCounts: Record<string, number> = {};

  for (const r of results) {
    const sid = r.case.sourceId;
    const a = bySource.get(sid) ?? { cases: 0, pass: 0, attempts: [], failures: {} };
    a.cases++;
    if (r.grade.pass) a.pass++;
    if (r.grade.attemptsToUsefulData != null) a.attempts.push(r.grade.attemptsToUsefulData);
    if (r.grade.failureCategory) {
      a.failures[r.grade.failureCategory] = (a.failures[r.grade.failureCategory] ?? 0) + 1;
      failCounts[r.grade.failureCategory] = (failCounts[r.grade.failureCategory] ?? 0) + 1;
    }
    bySource.set(sid, a);
  }

  const mean = (xs: number[]) =>
    xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : "—";
  const topFailure = (fs: Record<string, number>) => {
    const e = Object.entries(fs).sort((a, b) => b[1] - a[1])[0];
    return e ? `${e[0]} (${e[1]})` : "—";
  };

  const lines: string[] = [];
  lines.push("# Eval Summary");
  lines.push("");
  lines.push(`Overall pass rate: **${passed}/${total} (${rate}%)**`);
  lines.push("");

  lines.push("## Per-source");
  lines.push("");
  lines.push("| source | cases | pass | mean attempts | top failure |");
  lines.push("| --- | --- | --- | --- | --- |");
  const sourceRows = [...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [sid, a] of sourceRows) {
    lines.push(
      `| ${sid} | ${a.cases} | ${a.pass}/${a.cases} | ${mean(a.attempts)} | ${topFailure(a.failures)} |`,
    );
  }
  lines.push("");

  lines.push("## Failure categories");
  lines.push("");
  const fcEntries = Object.entries(failCounts).sort((a, b) => b[1] - a[1]);
  if (fcEntries.length === 0) {
    lines.push("None — all cases passed.");
  } else {
    for (const [cat, n] of fcEntries) lines.push(`- ${cat}: ${n}`);
  }
  lines.push("");

  lines.push("## Worst llmDocs offenders (lowest pass rate first)");
  lines.push("");
  lines.push("Sources where the blind agent struggled most — fix these docs next.");
  lines.push("");
  lines.push("| source | pass rate | cases | top failure |");
  lines.push("| --- | --- | --- | --- |");
  const ranked = [...bySource.entries()]
    .map(([sid, a]) => ({ sid, a, rate: a.pass / a.cases }))
    .sort((x, y) => x.rate - y.rate || y.a.cases - x.a.cases);
  for (const { sid, a, rate } of ranked) {
    lines.push(
      `| ${sid} | ${(rate * 100).toFixed(0)}% | ${a.cases} | ${topFailure(a.failures)} |`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.selftest) {
    await selftest();
    return;
  }

  console.log("Fetching production tools (tools/list)…");
  const defs = await listTools();
  const tools = toAnthropicTools(defs);
  console.log(`Loaded ${tools.length} prod tools: ${tools.map((t) => t.name).join(", ")}`);

  const allCases = await loadCases();
  const cases = applyFilters(allCases, flags);
  console.log(`Running ${cases.length} of ${allCases.length} case(s).\n`);

  if (cases.length === 0) {
    console.log("No cases matched. (evals/cases/*.json may be empty — authored by other agents.)");
    return;
  }

  const runDir = join(RESULTS_DIR, ts());
  await mkdir(runDir, { recursive: true });

  const results: CaseResult[] = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    const tag = `[${i + 1}/${cases.length}] ${c.id}`;
    try {
      const transcript = await runCase(c, tools);
      const grade = await gradeCase(transcript, c.successCriteria);
      results.push({ case: c, transcript, grade });
      const mark = grade.pass ? "PASS" : "FAIL";
      const why = grade.pass ? "" : ` (${grade.failureCategory ?? "?"})`;
      console.log(`${mark} ${tag}${why}`);
    } catch (e) {
      const transcript = {
        caseId: c.id,
        intent: c.intent,
        sourceId: c.sourceId,
        assistantTurns: [],
        toolCalls: [],
        roundsUsed: 0,
        finalAnswer: "",
        error: (e as Error).message,
      };
      const grade = {
        correctSource: false,
        firstQueryValid: false,
        attemptsToUsefulData: null,
        meetsCriteria: false,
        pass: false,
        failureCategory: "gave-up" as const,
        notes: `Harness crash: ${(e as Error).message}`,
      };
      results.push({ case: c, transcript, grade });
      console.log(`FAIL ${tag} (harness error: ${(e as Error).message})`);
    }
  }

  const summary = buildSummary(results);
  await writeFile(join(runDir, "results.json"), JSON.stringify(results, null, 2));
  await writeFile(join(runDir, "summary.md"), summary);

  const passed = results.filter((r) => r.grade.pass).length;
  console.log(`\nDone: ${passed}/${results.length} passed.`);
  console.log(`Results: ${join(runDir, "results.json")}`);
  console.log(`Summary: ${join(runDir, "summary.md")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
