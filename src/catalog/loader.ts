import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { SourceSpecSchema, type SourceSpec } from "./schema.js";

/**
 * Filesystem loader for source specs.
 *
 * Reads every sources/<id>/source.json, validates it against SourceSpecSchema,
 * and returns the validated specs sorted by id. Used by:
 *   - scripts/validate-sources.ts  (CI-style gate)
 *   - scripts/build-catalog.ts     (codegen → src/catalog/catalog.generated.ts)
 *
 * NOTE: runtime catalog access goes through the GENERATED module, not this
 * loader — Vercel serverless functions don't reliably ship loose repo files, so
 * the catalog is compiled in. Keep loader use to build/validate time.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root is two levels up from src/catalog/. */
export const REPO_ROOT = resolve(HERE, "..", "..");
export const SOURCES_DIR = join(REPO_ROOT, "sources");

export interface LoadError {
  sourceDir: string;
  error: string;
}

export interface LoadResult {
  specs: SourceSpec[];
  errors: LoadError[];
}

/** Read + validate every sources/<id>/source.json. Never throws; collects errors. */
export function loadSources(): LoadResult {
  const specs: SourceSpec[] = [];
  const errors: LoadError[] = [];

  if (!existsSync(SOURCES_DIR)) {
    return { specs, errors: [{ sourceDir: SOURCES_DIR, error: "sources/ dir not found" }] };
  }

  const dirs = readdirSync(SOURCES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dir of dirs) {
    const file = join(SOURCES_DIR, dir, "source.json");
    if (!existsSync(file)) {
      errors.push({ sourceDir: dir, error: "missing source.json" });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      errors.push({ sourceDir: dir, error: `invalid JSON: ${(e as Error).message}` });
      continue;
    }
    const parsed = SourceSpecSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({
        sourceDir: dir,
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      continue;
    }
    if (parsed.data.id !== dir) {
      errors.push({
        sourceDir: dir,
        error: `id "${parsed.data.id}" does not match folder name "${dir}"`,
      });
      continue;
    }
    specs.push(parsed.data);
  }

  specs.sort((a, b) => a.id.localeCompare(b.id));
  return { specs, errors };
}
