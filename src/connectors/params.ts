import type { RawQuery } from "./types.js";

/**
 * Apply a RawQuery's querystring params to a URL.
 *
 * Param values may be a single string or an array of strings. Arrays are
 * APPENDED (one repeated key per element) so that repeated/bracketed params
 * like `fields[]=title&fields[]=publication_date` or `conditions[type][]=RULE`
 * serialize correctly — a plain object + `searchParams.set()` could only ever
 * express one value per key, which silently dropped all but the last.
 */
export function applyParams(url: URL, params: RawQuery["params"]): void {
  if (!params) return;
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, item);
    } else {
      url.searchParams.set(k, v);
    }
  }
}
