import {
  callMessages,
  type AnthropicTool,
  type ContentBlock,
  type Message,
} from "./lib/anthropic.js";
import { callTool } from "./lib/mcp.js";
import type { AssistantTurn, Case, ToolCallRecord, Transcript } from "./lib/types.js";

/**
 * The blind-agent loop. A fresh conversation per case: the system prompt carries
 * NO GovData knowledge, so the agent must discover and drive sources using only
 * the two production tools. Up to 6 tool-call rounds; stops early on a final
 * text answer (end_turn with no tool_use).
 */

/** Hard cap on tool-call rounds per case. */
export const MAX_ROUNDS = 6;

/** Upstream response text is truncated to this many chars before storage. */
const RAW_TRUNC = 2048;

/**
 * Generic, source-blind agent system prompt. No source ids, no API hints, no
 * GovData-specific docs — the agent learns everything from the tools at runtime.
 */
export const GENERIC_AGENT_SYSTEM_PROMPT = `You are a data-retrieval agent. You have two tools for accessing US government and public datasets. Use them to answer the user's question with real data.

Your job:
1. Discover what data sources are available.
2. Pick the single most appropriate source for the question.
3. Construct a correct native query for that source's upstream API.
4. Read the response and extract the answer.

When you have the answer, state it plainly in text. If a query fails, inspect the error and try to fix your query, but do not loop indefinitely. Do not ask the user questions — work with what you have.`;

const trunc = (s: string) => (s.length > RAW_TRUNC ? s.slice(0, RAW_TRUNC) + "…[truncated]" : s);

/** Run a single case through the agent loop and return its Transcript. */
export async function runCase(c: Case, tools: AnthropicTool[]): Promise<Transcript> {
  const transcript: Transcript = {
    caseId: c.id,
    intent: c.intent,
    sourceId: c.sourceId,
    assistantTurns: [],
    toolCalls: [],
    roundsUsed: 0,
    finalAnswer: "",
    error: null,
    usage: { inputTokens: 0, outputTokens: 0 },
  };

  const messages: Message[] = [{ role: "user", content: c.intent }];

  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const resp = await callMessages({
        system: GENERIC_AGENT_SYSTEM_PROMPT,
        messages,
        tools,
        maxTokens: 4096,
      });

      if (resp.usage) {
        transcript.usage!.inputTokens += resp.usage.input_tokens;
        transcript.usage!.outputTokens += resp.usage.output_tokens;
      }

      const text = resp.content
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) {
        transcript.assistantTurns.push({ round, text });
        transcript.finalAnswer = text;
      }

      const toolUses = resp.content.filter(
        (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
      );

      // Final answer: no tool calls this turn.
      if (toolUses.length === 0) {
        transcript.roundsUsed = round - 1;
        return transcript;
      }

      transcript.roundsUsed = round;

      // Echo the assistant's content (text + tool_use) back into the conversation.
      messages.push({ role: "assistant", content: resp.content });

      // Execute every tool_use and append a tool_result for each id.
      const results: ContentBlock[] = [];
      for (const tu of toolUses) {
        const { text: rawText, errored } = await callTool(tu.name, tu.input);
        transcript.toolCalls.push({
          round,
          tool: tu.name,
          args: tu.input,
          rawResponse: trunc(rawText),
          errored,
        } satisfies ToolCallRecord);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: rawText,
          ...(errored ? { is_error: true } : {}),
        });
      }
      messages.push({ role: "user", content: results });
    }

    // Hit the round cap without a clean final answer; finalAnswer holds the last text.
    return transcript;
  } catch (e) {
    transcript.error = (e as Error).message;
    return transcript;
  }
}
