# LLM Doc Style Guide

Tool descriptions in GovData MCP are read by **agents**, not humans browsing a
portal. The description string is the only thing an LLM sees before it constructs
a query, so it must teach the agent to drive the upstream API correctly on the
first try. Since we do **raw passthrough** (no normalization), the docs carry the
entire burden of explaining the upstream schema.

## Required sections

Every connector description should contain these four labeled blocks, in order:

### 1. `ENDPOINT PATTERNS`
List each endpoint as a method + path template with `{placeholders}`. State what
the response contains and any multi-step flow.

> `GET /points/{lat},{lon}` — entry point; `.properties.forecast` is the URL to
> fetch next.

### 2. `PARAMETER FORMAT`
Spell out exact formats: types, separators, casing, encoding, precision.
Ambiguity here is the #1 cause of failed agent queries.

> Coordinates: decimal degrees, `"lat,lon"`, no space, western/southern negative,
> ~4 decimals max.

### 3. `EXAMPLE QUERIES`
1–2 concrete, copyable examples. Show multi-step flows step-by-step with the
field the agent reads between calls.

> 1. Forecast for Denver: (a) `/points/39.7456,-104.9903` → read
>    `.properties.forecast`; (b) GET that URL → `.properties.periods[0]`.

### 4. `COMMON ERRORS`
The failure modes an agent will actually hit, with the cause. Map status codes to
root causes so the agent can self-correct instead of retrying blindly.

> `404 on /points`: coordinates outside US coverage or malformed (space after
> comma).

## Principles

1. Write imperatively and densely — no marketing, no filler. Tokens are budget.
2. Name exact field paths (`.properties.periods[]`) the agent reads from responses.
3. Prefer one real example over three abstract ones.
4. State auth/headers the gateway injects so the agent doesn't try to add them.
5. Call out multi-step flows explicitly; agents fail silently on hidden second hops.
6. List error→cause pairs so the agent corrects rather than retries.
