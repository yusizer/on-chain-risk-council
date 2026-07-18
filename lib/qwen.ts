/**
 * lib/qwen.ts — Centralized Qwen Cloud (DashScope) client.
 *
 * DashScope exposes an OpenAI-compatible endpoint, so we reuse the OpenAI SDK
 * with a custom baseURL. All model calls route through here so model selection,
 * token limits, and prompts live in one place (Minutely-style single config).
 *
 * Base URL: https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 * Docs: https://docs.qwencloud.com/developer-guides/getting-started/text-generation-models
 */
import OpenAI from "openai";
import { z } from "zod";

const BASE_URL =
  process.env.QWEN_BASE_URL ??
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const QWEN_TIMEOUT_MS = Number(process.env.QWEN_TIMEOUT_MS ?? 60_000);

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey && process.env.NODE_ENV !== "test") {
  // Warn, don't crash — routes fall back to deterministic mode without a key.
  console.warn("[qwen] DASHSCOPE_API_KEY not set — running key-free fallback.");
}

/** Single client instance reused across requests. */
export const qwen = new OpenAI({ apiKey: apiKey ?? "missing", baseURL: BASE_URL });

/**
 * Model registry. Each role picks the cheapest model that can do the job,
 * which the judges reward (sophistication + cost-awareness) and which keeps
 * us within the $40 hackathon coupon.
 */
export const MODELS = {
  /** Heavy reasoning: risk analysis, referee aggregation. 1M context, function-calling. */
  reasoning: "qwen3.7-max",
  /** Code / transaction-instruction analysis. 1M context, function-calling, structured output. */
  coder: "qwen3-coder-plus",
  /** Fast + cheap: intake routing, escalation summaries. */
  fast: "qwen-turbo",
  /** Embeddings for the exploit-pattern memory (pgvector). 1024-d default. */
  embedding: "text-embedding-v3",
} as const;

export type Role = keyof typeof MODELS;

/** Chat message shorthand. */
export type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Token usage returned by the model (for the benchmark cost metric). */
export type Usage = OpenAI.Completions.CompletionUsage;
export interface LLMResult<T> {
  value: T;
  usage: Usage;
}

/**
 * Mutable token budget threaded through a council run so the orchestrator can
 * total the cost without global state (concurrent-safe across requests).
 */
export interface TokenBudget {
  tokens: number;
  calls: number;
  byRole: Partial<Record<Role, number>>;
}

export function newBudget(): TokenBudget {
  return { tokens: 0, calls: 0, byRole: {} };
}

/** Add a usage record to the budget (no-op if budget is undefined). */
export function addUsage(budget: TokenBudget | undefined, role: Role, usage: Usage | undefined): void {
  if (!budget || !usage) return;
  const t = usage.total_tokens ?? 0;
  budget.tokens += t;
  budget.calls += 1;
  budget.byRole[role] = (budget.byRole[role] ?? 0) + t;
}

function requireApiKey(): void {
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY not set");
}

function requestOptions(): { signal?: AbortSignal } {
  if (!Number.isFinite(QWEN_TIMEOUT_MS) || QWEN_TIMEOUT_MS <= 0) return {};
  return { signal: AbortSignal.timeout(QWEN_TIMEOUT_MS) };
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1));
    throw new Error(`Qwen returned non-JSON content: ${content.slice(0, 160)}`);
  }
}

/**
 * Run a chat completion with structured JSON output (validated by a zod schema).
 * Returns the parsed object + token usage — agents must produce well-typed
 * decisions, never free-text that the guardrail trusts.
 */
export async function chatJSON<T>(
  role: Role,
  messages: Msg[],
  schema: z.ZodType<T>,
  opts: { temperature?: number; maxTokens?: number; tools?: OpenAI.Chat.Completions.ChatCompletionTool[] } = {},
): Promise<LLMResult<T>> {
  requireApiKey();
  const completion = await qwen.chat.completions.create(
    {
      model: MODELS[role],
      messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 2048,
      response_format: { type: "json_object" },
      tools: opts.tools,
    },
    requestOptions(),
  );
  const content = completion.choices[0]?.message?.content ?? "{}";
  const parsed = parseJsonContent(content);
  return { value: schema.parse(parsed), usage: completion.usage as Usage };
}

/** Plain text completion (escalation summaries, narration). */
export async function chatText(
  role: Role,
  messages: Msg[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<LLMResult<string>> {
  requireApiKey();
  const completion = await qwen.chat.completions.create(
    {
      model: MODELS[role],
      messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 1024,
    },
    requestOptions(),
  );
  return { value: completion.choices[0]?.message?.content ?? "", usage: completion.usage as Usage };
}

/** Embed text for the pgvector exploit-pattern memory. */
export async function embed(text: string): Promise<number[]> {
  requireApiKey();
  const res = await qwen.embeddings.create(
    {
      model: MODELS.embedding,
      input: text,
      dimensions: 1024,
    },
    requestOptions(),
  );
  return res.data[0]?.embedding ?? [];
}

/** Self-test: a one-token hello call to verify the key + endpoint. */
export async function ping(): Promise<{ ok: boolean; model: string; reply: string }> {
  if (!apiKey) return { ok: false, model: MODELS.fast, reply: "DASHSCOPE_API_KEY not set" };
  try {
    const r = await qwen.chat.completions.create(
      {
        model: MODELS.fast,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 5,
        temperature: 0,
      },
      requestOptions(),
    );
    return { ok: true, model: MODELS.fast, reply: r.choices[0]?.message?.content ?? "" };
  } catch (e) {
    return { ok: false, model: MODELS.fast, reply: String(e) };
  }
}
