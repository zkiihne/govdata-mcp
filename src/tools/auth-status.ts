import { CATALOG } from "../data/catalog.js";
import type { SourceSpec } from "../catalog/schema.js";

/**
 * BYOK (bring-your-own-key) provisioning tool.
 *
 * The gateway ships NO master API keys. Keyless sources work out of the box;
 * keyed sources read their key from the environment per the source's auth block
 * (auth.credentialRef = "env:VAR"). This tool reports, for every keyed source,
 * which env var to set, whether it is currently set, and where to get a key —
 * so an agent can tell the user exactly what to provision before querying.
 */
export const AUTH_STATUS_TOOL_NAME = "auth_status";

export const AUTH_STATUS_TOOL_DESCRIPTION = `Report which data sources need a bring-your-own API key and whether each key is currently configured in this server's environment. FREE, no cost.

Call this before querying keyed sources. Keyless sources (which work with no setup) are not listed. For each keyed source it returns: id, the exact env var to set, whether it is currently set, whether the key is free, and the signup URL to get one. Most US government API keys are free and take ~2 minutes to obtain.`;

/** Extract the env var name from a credentialRef like "env:BLS_API_KEY". */
export function envVarFromRef(ref: string | null): string | null {
  if (!ref) return null;
  const [scheme, name] = ref.split(":", 2);
  return scheme === "env" && name ? name : null;
}

export interface KeyRequirement {
  id: string;
  name: string;
  status: string;
  /** Env var the key is read from, e.g. "BLS_API_KEY". */
  envVar: string | null;
  /** True when that env var is currently set (non-empty). */
  configured: boolean;
  /** Whether obtaining the key is free. All current gov sources are free. */
  free: boolean;
  /** Where to sign up for a key. */
  signupUrl: string | null;
}

/** Every source that requires an API key, with its current provisioning state. */
export function keyRequirements(catalog: readonly SourceSpec[] = CATALOG): KeyRequirement[] {
  return catalog
    .filter((s) => s.auth.type !== "none")
    .map((s) => {
      const envVar = envVarFromRef(s.auth.credentialRef);
      const val = envVar ? process.env[envVar] : undefined;
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        envVar,
        configured: typeof val === "string" && val !== "",
        free: true,
        signupUrl: s.auth.signupUrl,
      };
    });
}

export interface AuthStatusResult {
  summary: string;
  missing: KeyRequirement[];
  configured: string[];
  sources: KeyRequirement[];
}

export function runAuthStatus(): AuthStatusResult {
  const keyed = keyRequirements();
  const missing = keyed.filter((k) => !k.configured);
  const set = keyed.filter((k) => k.configured);
  return {
    summary:
      `${keyed.length} sources require a bring-your-own API key. ` +
      `${set.length} configured, ${missing.length} missing. ` +
      `All listed keys are free. Keyless sources need no setup and are not listed here.`,
    missing,
    configured: set.map((k) => k.id),
    sources: keyed,
  };
}

/**
 * One-line BYOK provisioning note for a keyed source, appended to its query
 * tool docs. Returns "" for keyless sources.
 */
export function byokNote(spec: SourceSpec): string {
  if (spec.auth.type === "none") return "";
  const envVar = envVarFromRef(spec.auth.credentialRef) ?? "(unset)";
  const signup = spec.auth.signupUrl ? ` Get a free key at ${spec.auth.signupUrl}.` : "";
  return `\n🔑 BYOK: this source needs an API key. Set env ${envVar}.${signup} Until it is set, queries return 503. Call auth_status to check.`;
}
