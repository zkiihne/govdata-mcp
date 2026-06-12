import { callMessages, type AnthropicTool, type ContentBlock } from "./lib/anthropic.js";
import type { GradeResult, Transcript } from "./lib/types.js";

/**
 * LLM grader. Separate Messages API call that inspects the full transcript —
 * tool args and raw responses included — so it can verify the queried source id
 * and query validity directly, not just trust the agent's prose. Strict but fair.
 *
 * Output is forced through a single tool schema so the verdict is always
 * structured JSON we can parse without prompt-format gymnastics.
 */

const GRADE_TOOL: AnthropicTool = {
  name: "record_grade",
  description: "Record the structured grade for this agent transcript.",
  input_schema: {
    type: "object",
    properties: {
      correctSource: {
        type: "boolean",
        description: "Did the agent actually query the expected sourceId via query_data_source?",
      },
      firstQueryValid: {
        type: "boolean",
        description:
          "Was the FIRST query_data_source call syntactically valid — not malformed and not rejected by our gateway with a 4xx?",
      },
      attemptsToUsefulData: {
        type: ["number", "null"],
        description: "Round number (1-6) when useful data was first obtained, or null if never.",
      },
      meetsCriteria: {
        type: "boolean",
        description: "Does the final answer satisfy the successCriteria?",
      },
      pass: { type: "boolean", description: "Overall pass; must equal meetsCriteria." },
      failureCategory: {
        type: ["string", "null"],
        enum: [
          "wrong-source",
          "bad-query-syntax",
          "misread-response",
          "gave-up",
          "upstream-error",
          null,
        ],
        description: "Failure bucket; null if pass.",
      },
      notes: { type: "string", description: "Short explanation (one or two sentences)." },
    },
    required: [
      "correctSource",
      "firstQueryValid",
      "attemptsToUsefulData",
      "meetsCriteria",
      "pass",
      "failureCategory",
      "notes",
    ],
    additionalProperties: false,
  },
};

const GRADER_SYSTEM = `You are a strict but fair evaluator of an AI data-retrieval agent. The agent was "blind": it had no documentation about the available data sources and had to discover everything through two MCP tools (discover_data_sources, query_data_source).

You will be given:
- The user's intent.
- The expected correct source id.
- The success criteria.
- The full transcript: every tool call (name, args, truncated raw response) and the agent's final answer.

Grade by inspecting the actual tool args and responses, not just the agent's prose. Determine:
- correctSource: did a query_data_source call use the expected source id (connectorId)?
- firstQueryValid: was the first query syntactically well-formed and accepted (not a malformed request or a gateway 4xx)?
- attemptsToUsefulData: in which round did the agent first obtain useful upstream data (1-6), or null if never.
- meetsCriteria: does the FINAL answer actually satisfy the success criteria? Be strict — vague or unsupported claims do not pass.
- pass = meetsCriteria.
- failureCategory: pick the single best bucket if failing, else null.

Call record_grade exactly once with your verdict. Do not write any other text.`;

/** Grade one transcript against its case success criteria. */
export async function gradeCase(
  transcript: Transcript,
  successCriteria: string,
): Promise<GradeResult> {
  const payload = {
    intent: transcript.intent,
    expectedSourceId: transcript.sourceId,
    successCriteria,
    harnessError: transcript.error,
    roundsUsed: transcript.roundsUsed,
    toolCalls: transcript.toolCalls,
    finalAnswer: transcript.finalAnswer,
  };

  const resp = await callMessages({
    system: GRADER_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Grade this transcript:\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    tools: [GRADE_TOOL],
    maxTokens: 1024,
  });

  const toolUse = resp.content.find(
    (b): b is Extract<ContentBlock, { type: "tool_use" }> =>
      b.type === "tool_use" && b.name === "record_grade",
  );

  if (!toolUse) {
    return {
      correctSource: false,
      firstQueryValid: false,
      attemptsToUsefulData: null,
      meetsCriteria: false,
      pass: false,
      failureCategory: "gave-up",
      notes: "Grader did not return a structured verdict.",
    };
  }

  const g = toolUse.input as Partial<GradeResult>;
  return {
    correctSource: !!g.correctSource,
    firstQueryValid: !!g.firstQueryValid,
    attemptsToUsefulData:
      typeof g.attemptsToUsefulData === "number" ? g.attemptsToUsefulData : null,
    meetsCriteria: !!g.meetsCriteria,
    pass: !!g.pass,
    failureCategory: g.failureCategory ?? (g.pass ? null : "gave-up"),
    notes: g.notes ?? "",
  };
}
