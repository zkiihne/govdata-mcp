import { readdir, readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Case, CaseResult } from "./lib/types.js";

/**
 * Collector — the SEPARATE scoreboard step.
 *
 * Reads every per-case result file under evals/results/<run-id>/cases/*.json
 * (written incrementally by run.ts) and emits results.json + summary.md with the
 * same scoreboard format as before: overall + per-source pass rates, mean
 * attempts, failure-category counts, and a ranked "worst llmDocs offenders" list.
 *
 * Idempotent and safe on PARTIAL runs: any case in evals/cases/*.json that has no
 * result file yet is reported under a "Not run" section rather than skewing the
 * pass rate.
 *
 * Usage:
 *   npm run eval:collect -- <run-id>
 *   npm run eval:collect -- --run-id=<run-id>
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(HERE, "cases");
const RESULTS_DIR = join(HERE, "results");

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Load and flatten every case array under evals/cases/*.json. */
async function loadAllCases(): Promise<Case[]> {
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

/** Read all per-case result files in a run dir, sorted by case id. */
async function loadCaseResults(casesDir: string): Promise<CaseResult[]> {
  let files: string[];
  try {
    files = (await readdir(casesDir)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: CaseResult[] = [];
  for (const f of files.sort()) {
    try {
      const raw = await readFile(join(casesDir, f), "utf8");
      out.push(JSON.parse(raw) as CaseResult);
    } catch {
      // Skip unreadable/partial files (e.g. mid-write); collector stays robust.
    }
  }
  return out;
}

/** Build the markdown scoreboard from results, noting any not-run cases. */
function buildSummary(results: CaseResult[], notRun: Case[]): string {
  const total = results.length;
  const passed = results.filter((r) => r.grade.pass).length;
  const rate = total ? ((passed / total) * 100).toFixed(1) : "0.0";

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
  if (notRun.length) {
    lines.push("");
    lines.push(`> Partial run — ${notRun.length} case(s) not yet run (excluded from rate).`);
  }
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
    lines.push("None — all graded cases passed.");
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

  if (notRun.length) {
    lines.push("## Not run");
    lines.push("");
    lines.push(`${notRun.length} case(s) have no result file yet:`);
    lines.push("");
    for (const c of notRun.sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- ${c.id} (${c.sourceId})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let runId: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--run-id=")) runId = a.slice("--run-id=".length);
    else if (!a.startsWith("--")) runId = a; // positional
  }

  if (!runId) {
    console.error("Usage: npm run eval:collect -- <run-id>");
    process.exit(1);
  }

  const runDir = join(RESULTS_DIR, runId);
  const casesDir = join(runDir, "cases");
  if (!(await exists(casesDir))) {
    console.error(`No cases dir at ${casesDir} — is the run id correct?`);
    process.exit(1);
  }

  const results = await loadCaseResults(casesDir);
  const allCases = await loadAllCases();
  const haveIds = new Set(results.map((r) => r.case.id));
  const notRun = allCases.filter((c) => !haveIds.has(c.id));

  const summary = buildSummary(results, notRun);
  await writeFile(join(runDir, "results.json"), JSON.stringify(results, null, 2));
  await writeFile(join(runDir, "summary.md"), summary);

  const passed = results.filter((r) => r.grade.pass).length;
  console.log(`Collected ${results.length} case result(s); ${notRun.length} not run.`);
  console.log(`Pass rate: ${passed}/${results.length}`);
  console.log(`Results: ${join(runDir, "results.json")}`);
  console.log(`Summary: ${join(runDir, "summary.md")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
