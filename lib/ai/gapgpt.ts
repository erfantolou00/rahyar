import OpenAI, { APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";
import type { ChatMessage } from "@/lib/ai/messages";

/**
 * GapGPT Chat Completions via the OpenAI SDK.
 * Docs: https://gapgpt.app/platform-v2/docs/models/gpt-5-6
 * Their Luna id is gpt-5.6-luna. This app defaults to gpt-6-luna.
 */
export const GAPGPT_DEFAULT_BASE = "https://api.gapgpt.app/v1";
export const GAPGPT_DEFAULT_MODEL = "gpt-6-luna";

export type CompletionResult =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: "missing_key" | "invalid_key" | "timeout" | "upstream"; detail: string };

export function gapgptConfig(): { apiKey: string | null; baseUrl: string; model: string } {
  const base = process.env.GAPGPT_BASE_URL?.trim() || GAPGPT_DEFAULT_BASE;
  return {
    apiKey: process.env.GAPGPT_API_KEY?.trim() || null,
    baseUrl: base.replace(/\/$/, ""),
    model: process.env.GAPGPT_MODEL?.trim() || GAPGPT_DEFAULT_MODEL,
  };
}

export function readCompletionText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("choices" in payload)) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (!Array.isArray(content)) return null;
  const text = content
    .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
    .join("")
    .trim();
  return text || null;
}

export function readErrorDetail(payload: unknown, secret: string): string {
  let detail = "upstream";
  if (payload && typeof payload === "object") {
    const record = payload as { error?: { message?: unknown }; message?: unknown };
    const message = record.error?.message ?? record.message;
    if (typeof message === "string" && message.trim()) detail = message.trim();
  }
  return detail.split(secret).join("[key]").slice(0, 200);
}

export function publicModelDetail(detail: string): string {
  const clean = detail.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean || /<[^>]+>/.test(clean) || /key|token|secret|bearer/i.test(clean)) return "";
  return ` (${clean})`;
}

export async function completeChat(
  messages: ChatMessage[],
  options?: { timeoutMs?: number; maxTokens?: number },
): Promise<CompletionResult> {
  const { apiKey, baseUrl, model } = gapgptConfig();
  if (!apiKey) return { ok: false, reason: "missing_key", detail: "missing key" };

  const timeoutMs = options?.timeoutMs ?? 20_000;
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: timeoutMs,
    maxRetries: 0,
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      max_completion_tokens: options?.maxTokens ?? 500,
    });
    const text = readCompletionText(completion);
    if (!text) return { ok: false, reason: "upstream", detail: "empty" };
    return { ok: true, text: text.slice(0, 4000), model };
  } catch (error) {
    if (error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError) {
      return { ok: false, reason: "timeout", detail: "timeout" };
    }
    if (error instanceof APIError) {
      const detail = readErrorDetail({ message: error.message, error: error.error }, apiKey);
      if (error.status === 401 || error.status === 403) {
        return { ok: false, reason: "invalid_key", detail };
      }
      return { ok: false, reason: "upstream", detail };
    }
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: "timeout", detail: "timeout" };
    }
    return { ok: false, reason: "upstream", detail: "network" };
  }
}
