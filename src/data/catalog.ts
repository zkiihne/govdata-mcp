import { SOURCES } from "../catalog/catalog.generated.js";
import type { SourceSpec } from "../catalog/schema.js";

/**
 * Runtime catalog. NOT hand-edited — it re-exports the generated source specs
 * (built from sources/<id>/source.json by scripts/build-catalog.ts). Adding a
 * source = drop a sources/<id>/source.json and run `npm run catalog`.
 *
 * The discovery tool serializes these specs; the router reads `status` to
 * decide implemented vs. not-yet-implemented routing. Everything is free; keyed
 * sources are bring-your-own-key via their auth block.
 */
export const CATALOG: readonly SourceSpec[] = SOURCES;

export function getSource(id: string): SourceSpec | undefined {
  return CATALOG.find((s) => s.id === id);
}

/** Back-compat alias used by the router. */
export const getCatalogEntry = getSource;
