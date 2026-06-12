/**
 * Shared types for the agent-blind eval harness.
 *
 * A "case" tests whether a fresh agent, given ONLY the two production MCP tools
 * (no GovData docs in its system prompt), can discover a source, build a correct
 * native query, and read usable data back. Cases are authored in evals/cases/*.json.
 */

/** A single eval case, authored as one element of a JSON array in evals/cases/*.json. */
export interface Case {
  /** Unique case id, e.g. "usgs-earthquake-recent". */
  id: string;
  /** The single correct source id the agent is expected to query. */
  sourceId: string;
  /** The user request handed to the blind agent. */
  intent: string;
  /** Natural-language description of what a passing final answer must contain. */
  successCriteria: string;
  /** Author-assigned difficulty label, free-form (e.g. "easy" | "medium" | "hard"). */
  difficulty?: string;
  /** Optional author note (e.g. source-overlap rationale); informational, not graded. */
  notes?: string;
}

/** One MCP tool invocation the agent made, plus the (truncated) upstream response. */
export interface ToolCallRecord {
  /** Round index (1-based) in which this call was issued. */
  round: number;
  /** Tool name, e.g. "discover_data_sources" | "query_data_source". */
  tool: string;
  /** Arguments the agent passed to the tool. */
  args: Record<string, unknown>;
  /** Raw upstream/tool response text, truncated to ~2KB for storage. */
  rawResponse: string;
  /** True if the upstream call errored at the transport level. */
  errored?: boolean;
}

/** One assistant turn's text output (the model's reasoning/answer for that round). */
export interface AssistantTurn {
  round: number;
  text: string;
}

/** Full record of a single case run through the agent loop. */
export interface Transcript {
  caseId: string;
  intent: string;
  /** The expected source id, carried through for the grader. */
  sourceId: string;
  /** Every assistant text turn, in order. */
  assistantTurns: AssistantTurn[];
  /** Every tool call, in order. */
  toolCalls: ToolCallRecord[];
  /** Number of tool-call rounds actually used (0-6). */
  roundsUsed: number;
  /** Last assistant text (the final answer), or "" if none. */
  finalAnswer: string;
  /** Harness-level error (auth, transport, loop crash), if any. */
  error: string | null;
  /** Approximate token usage, if cheaply available. */
  usage?: { inputTokens: number; outputTokens: number };
}

/** Grader verdict for one transcript. */
export interface GradeResult {
  /** Did the agent actually query the expected sourceId? */
  correctSource: boolean;
  /** Was the first query_data_source call syntactically valid (not a gateway 4xx / malformed)? */
  firstQueryValid: boolean;
  /** Rounds until useful data was obtained (1-6), or null if never. */
  attemptsToUsefulData: number | null;
  /** Does the final answer satisfy successCriteria? */
  meetsCriteria: boolean;
  /** Overall pass (== meetsCriteria). */
  pass: boolean;
  /** Failure bucket, or null when pass. */
  failureCategory:
    | "wrong-source"
    | "bad-query-syntax"
    | "misread-response"
    | "gave-up"
    | "upstream-error"
    | null;
  /** Short human-readable explanation. */
  notes: string;
  /** Token usage for the grader's own Messages API call(s), if available. */
  usage?: TokenUsage;
}

/** Input/output token counts summed across one or more Anthropic API responses. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Per-case token usage split by phase, with the combined total. */
export interface CaseUsage {
  /** Tokens spent in the blind-agent loop (all rounds). */
  agent: TokenUsage;
  /** Tokens spent by the grader. */
  grader: TokenUsage;
  /** agent + grader. */
  total: TokenUsage;
}

/** One fully-evaluated case: the case, its transcript, and the grade. */
export interface CaseResult {
  case: Case;
  transcript: Transcript;
  grade: GradeResult;
  /** Combined agent + grader token usage for this case, if available. */
  usage?: CaseUsage;
}
