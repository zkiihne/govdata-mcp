import type { AuthSpec } from "../catalog/schema.js";

/**
 * Generic credential injector.
 *
 * Connectors do NOT hand-code auth. They declare their source's auth block
 * (from source.json) and call injectAuth() while assembling the upstream
 * request. The injector resolves the credential reference and places it where
 * the source expects — query param, header, or JSON body — per auth.placement.
 */

/** Resolve a credentialRef like "env:BLS_API_KEY" to its value, or undefined. */
export function resolveCredential(ref: string | null): string | undefined {
  if (!ref) return undefined;
  const [scheme, name] = ref.split(":", 2);
  if (scheme === "env" && name) return process.env[name];
  throw new Error(`Unsupported credentialRef scheme: "${ref}" (only env:VAR supported)`);
}

export interface InjectContext {
  /** URL being built; query-placement credentials are added to its searchParams. */
  url: URL;
  /** Mutable header map; header-placement credentials are set here. */
  headers: Record<string, string>;
  /** Mutable JSON body; body-placement credentials are set here. Pass {} if none. */
  body?: Record<string, unknown>;
}

export class MissingCredentialError extends Error {
  constructor(public readonly credentialRef: string) {
    super(`Missing credential for ref "${credentialRef}". Set the environment variable.`);
    this.name = "MissingCredentialError";
  }
}

/**
 * Inject the source's credential into the request per its auth spec.
 * - auth.type "none": no-op.
 * - otherwise: resolve credentialRef; throw MissingCredentialError if unset;
 *   place it at auth.paramName in the query / header / body per auth.placement.
 */
export function injectAuth(auth: AuthSpec, ctx: InjectContext): void {
  if (auth.type === "none") return;

  const credential = resolveCredential(auth.credentialRef);
  if (credential === undefined || credential === "") {
    throw new MissingCredentialError(auth.credentialRef ?? "(unspecified)");
  }
  const param = auth.paramName;
  if (!param) throw new Error(`auth.paramName required for auth.type "${auth.type}"`);

  switch (auth.placement) {
    case "query":
      ctx.url.searchParams.set(param, credential);
      return;
    case "header":
      ctx.headers[param] = credential;
      return;
    case "body":
      if (!ctx.body) throw new Error("injectAuth: body placement requires a body object");
      ctx.body[param] = credential;
      return;
    default:
      throw new Error(`Unknown auth.placement "${auth.placement}"`);
  }
}
