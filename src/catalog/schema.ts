import { z } from "zod";

/**
 * Source spec schema — the single source of truth for what a data source is.
 *
 * Every source lives at sources/<id>/source.json and MUST validate against this
 * schema. The catalog (src/data/catalog.ts) is generated from these files; the
 * discovery tool serves the validated specs verbatim. See docs/onboarding.md.
 */

export const STATUS = ["planned", "testing", "live", "degraded", "retired"] as const;
export const AUTH_TYPE = ["none", "api-key", "oauth"] as const;
export const AUTH_PLACEMENT = ["query", "header", "body"] as const;

const EndpointSchema = z.object({
  id: z.string(),
  path: z.string(),
  method: z.string(),
  description: z.string(),
});

const ApiSchema = z.object({
  baseUrl: z.string().url(),
  protocol: z.string(),
  docsUrl: z.string(),
  endpoints: z.array(EndpointSchema).min(1),
});

const AuthSchema = z.object({
  type: z.enum(AUTH_TYPE),
  placement: z.enum(AUTH_PLACEMENT).nullable(),
  paramName: z.string().nullable(),
  /** How the credential is resolved, e.g. "env:BLS_API_KEY". null when type is none. */
  credentialRef: z.string().nullable(),
  signupUrl: z.string().nullable(),
});

const LimitsSchema = z.object({
  dailyQuota: z.number().nullable(),
  perRequestMaxSeries: z.number().nullable(),
  rateLimitBehavior: z.string(),
  notes: z.string(),
});

const ExampleQuerySchema = z.object({
  intent: z.string(),
  /** Literal raw request payload an agent would send. Shape is upstream-specific. */
  request: z.unknown(),
});

const LlmDocsSchema = z.object({
  summary: z.string(),
  queryGuide: z.string(),
  exampleQueries: z.array(ExampleQuerySchema),
  gotchas: z.array(z.string()),
});

const ComplianceSchema = z.object({
  license: z.string(),
  tosUrl: z.string(),
  redistributionNotes: z.string(),
  /** GATE: a source may not go live until compliance has been reviewed (date set). */
  reviewedDate: z.string().nullable(),
});

const MetaSchema = z.object({
  addedDate: z.string(),
  lastTestedDate: z.string().nullable(),
  connectorPath: z.string(),
});

export const SourceSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "id must be kebab-case"),
    name: z.string(),
    agency: z.string(),
    category: z.string(),
    status: z.enum(STATUS),
    api: ApiSchema,
    auth: AuthSchema,
    limits: LimitsSchema,
    llmDocs: LlmDocsSchema,
    compliance: ComplianceSchema,
    meta: MetaSchema,
  })
  .superRefine((spec, ctx) => {
    // When auth is required, placement/paramName/credentialRef must be present.
    if (spec.auth.type !== "none") {
      for (const field of ["placement", "paramName", "credentialRef"] as const) {
        if (spec.auth[field] == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["auth", field],
            message: `auth.${field} is required when auth.type is "${spec.auth.type}"`,
          });
        }
      }
    }
    // A source may only be marked live/degraded once compliance has been reviewed.
    if (
      (spec.status === "live" || spec.status === "degraded") &&
      spec.compliance.reviewedDate == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["compliance", "reviewedDate"],
        message: `status "${spec.status}" requires compliance.reviewedDate to be set (vet gate)`,
      });
    }
  });

export type SourceSpec = z.infer<typeof SourceSpecSchema>;
export type AuthSpec = z.infer<typeof AuthSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
