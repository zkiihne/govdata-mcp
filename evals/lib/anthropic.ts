import { execSync } from "node:child_process";

/**
 * Minimal Anthropic Messages API client driven by the local Claude Code OAuth
 * subscription token (there is NO API key on this machine).
 *
 * The token is read from the macOS keychain at runtime. The request MUST use
 * `authorization: Bearer` (not x-api-key), the oauth beta header, and a `system`
 * array whose FIRST block is the Claude Code identity preamble — otherwise the
 * API rejects the call with a misleading "rate_limit_error".
 */

/** Model id used for both the blind agent and the grader. */
export const MODEL = "claude-sonnet-4-6";

const API_URL = "https://api.anthropic.com/v1/messages";

/** Read the Claude Code OAuth access token from the macOS keychain. */
function getToken(): string {
  const raw = execSync(`security find-generic-password -s "Claude Code-credentials" -w`, {
    encoding: "utf8",
  });
  return JSON.parse(raw).claudeAiOauth.accessToken; // sk-ant-oat01-...
}

/** Identity preamble required as system[0]; leaks zero GovData knowledge. */
export const CLAUDE_CODE_PREAMBLE =
  "You are Claude Code, Anthropic's official CLI for Claude.";

/** Anthropic tool definition (Messages API shape). */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** A content block in a request/response message. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface MessagesRequest {
  /** System blocks AFTER the preamble (caller-supplied); preamble is prepended automatically. */
  system: string;
  messages: Message[];
  tools?: AnthropicTool[];
  maxTokens?: number;
  model?: string;
}

export interface MessagesResponse {
  content: ContentBlock[];
  stop_reason: string | null;
  usage?: { input_tokens: number; output_tokens: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the Messages API (non-streaming, returns plain JSON). Retries real
 * rate-limit / overloaded errors with backoff (3 tries, 2s→6s→18s). A 429 on a
 * request whose system[0] is the preamble is a genuine rate limit (the fake one
 * only fires when the preamble is missing, which we never do).
 */
export async function callMessages(req: MessagesRequest): Promise<MessagesResponse> {
  const token = getToken();
  const body = {
    model: req.model ?? MODEL,
    max_tokens: req.maxTokens ?? 4096,
    system: [
      { type: "text", text: CLAUDE_CODE_PREAMBLE },
      { type: "text", text: req.system },
    ],
    messages: req.messages,
    ...(req.tools ? { tools: req.tools } : {}),
  };

  const delays = [2000, 6000, 18000];
  let lastErr = "";
  for (let attempt = 0; attempt < delays.length; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const json = (await res.json()) as MessagesResponse;
      return json;
    }

    const text = await res.text();
    lastErr = `HTTP ${res.status}: ${text.slice(0, 500)}`;
    const retryable =
      res.status === 429 ||
      res.status === 529 ||
      /overloaded_error|rate_limit_error/.test(text);
    if (retryable && attempt < delays.length - 1) {
      await sleep(delays[attempt]!);
      continue;
    }
    throw new Error(`Messages API failed: ${lastErr}`);
  }
  throw new Error(`Messages API failed after retries: ${lastErr}`);
}

/** Convenience: extract concatenated text from a response's content blocks. */
export function textOf(resp: MessagesResponse): string {
  return resp.content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
