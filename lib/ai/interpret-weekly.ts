import { completeChat, publicModelDetail } from "@/lib/ai/gapgpt";
import { fivePersianLines } from "@/lib/ai/lines";
import type { ChatMessage } from "@/lib/ai/messages";
import { replyUsesKnownNumbers } from "@/lib/ai/numbers";
import { interpretSystemPrompt } from "@/lib/ai/prompt";
import { INTERPRET_POLICY, takeRateSlot } from "@/lib/ai/rate-limit";
import type { FinanceClient } from "@/lib/finance/queries";
import type { Json, Report } from "@/lib/finance/types";
import { parseWeeklyContent, weeklyContentJson, withCommentary } from "@/lib/finance/weekly";

export type InterpretCode =
  | "missing_key"
  | "invalid_key"
  | "timeout"
  | "upstream"
  | "rejected"
  | "lines"
  | "rate_limit"
  | "save"
  | "invalid";

export type InterpretResult =
  | { ok: true; commentary: string }
  | { ok: false; code: InterpretCode; message: string; stored: boolean };

const failureText: Record<InterpretCode, string> = {
  missing_key: "کلید گپ‌جی‌پی‌تی روی سرور تنظیم نشده است.",
  invalid_key: "کلید گپ‌جی‌پی‌تی را سرویس رد کرد. یک کلید تازه بگذارید و برنامه را دوباره اجرا کنید.",
  timeout: "مدل در زمان مقرر پاسخ نداد. گزارش عددی سر جایش مانده است.",
  upstream: "مدل الان پاسخ نداد. گزارش عددی سر جایش مانده است.",
  rejected: "تفسیر پذیرفته نشد چون عددی خارج از داده‌های محاسبه‌شده داشت.",
  lines: "تفسیر پذیرفته نشد چون دقیقاً پنج خط نبود.",
  rate_limit: "تعداد درخواست تفسیر زیاد است. کمی بعد دوباره تلاش کنید.",
  save: "تفسیر ذخیره نشد. دوباره تلاش کنید.",
  invalid: "این گزارش ساختار هفتگی ندارد.",
};

export function interpretStatusMessage(code: string | undefined): string | null {
  if (!code || !(code in failureText)) return null;
  return failureText[code as InterpretCode];
}

/**
 * Reads a saved phase-5 weekly report, asks the model for five Persian lines,
 * and writes only `commentary`. The numeric fields are not rebuilt.
 */
export async function interpretWeeklyReport(
  supabase: FinanceClient,
  userId: string,
  reportId: string,
  options?: { limit?: boolean; complete?: typeof completeChat },
): Promise<InterpretResult> {
  if (options?.limit !== false) {
    const slot = takeRateSlot(`interpret:${userId}`, Date.now(), INTERPRET_POLICY);
    if (!slot.ok) {
      return {
        ok: false,
        code: "rate_limit",
        stored: false,
        message: `تعداد درخواست تفسیر زیاد است. ${slot.retryAfterSeconds} ثانیه بعد دوباره تلاش کنید.`,
      };
    }
  }

  const loaded = await supabase.from("reports").select("*").eq("id", reportId).eq("user_id", userId).maybeSingle();
  if (loaded.error || !loaded.data) {
    if (loaded.error) console.error(loaded.error);
    return { ok: false, code: "invalid", stored: false, message: failureText.invalid };
  }

  const report = loaded.data as Report;
  const content = report.type === "weekly" ? parseWeeklyContent(report.content) : null;
  if (!content) return { ok: false, code: "invalid", stored: false, message: failureText.invalid };

  const facts = { ...content, commentary: null };
  const messages: ChatMessage[] = [
    { role: "system", content: interpretSystemPrompt(facts) },
    { role: "user", content: "همین گزارش را در پنج خط تفسیر کن." },
  ];
  const completion = await (options?.complete ?? completeChat)(messages, { maxTokens: 400 });
  if (!completion.ok) {
    const message =
      completion.reason === "upstream"
        ? `${failureText.upstream}${publicModelDetail(completion.detail)}`
        : failureText[completion.reason];
    const stored =
      completion.reason === "missing_key" || completion.reason === "invalid_key"
        ? false
        : await insertAssistant(supabase, userId, message, {
            surface: "weekly_interpret",
            model: null,
            error: completion.reason,
            reportId,
            seen: facts,
          });
    return { ok: false, code: completion.reason, message, stored };
  }

  const lines = fivePersianLines(completion.text);
  if (!lines) {
    const stored = await insertAssistant(supabase, userId, failureText.lines, {
      surface: "weekly_interpret",
      model: completion.model,
      error: "lines",
      reportId,
      seen: facts,
      raw: completion.text.slice(0, 2000),
    });
    return { ok: false, code: "lines", message: failureText.lines, stored };
  }

  const commentary = lines.join("\n");
  if (!replyUsesKnownNumbers(commentary, [facts])) {
    const stored = await insertAssistant(supabase, userId, failureText.rejected, {
      surface: "weekly_interpret",
      model: completion.model,
      error: "rejected",
      reportId,
      seen: facts,
      raw: completion.text.slice(0, 2000),
    });
    return { ok: false, code: "rejected", message: failureText.rejected, stored };
  }

  const stored = await insertAssistant(supabase, userId, commentary, {
    surface: "weekly_interpret",
    model: completion.model,
    reportId,
    seen: facts,
  });
  if (!stored) return { ok: false, code: "save", message: failureText.save, stored: false };

  const updated = await supabase
    .from("reports")
    .update({ content: weeklyContentJson(withCommentary(facts, commentary)) })
    .eq("id", reportId)
    .eq("user_id", userId);
  if (updated.error) {
    console.error(updated.error);
    return { ok: false, code: "save", message: failureText.save, stored: true };
  }

  return { ok: true, commentary };
}

async function insertAssistant(
  supabase: FinanceClient,
  userId: string,
  message: string,
  context: Json,
): Promise<boolean> {
  const text = message.trim().slice(0, 4000);
  if (!text) return false;
  const { error } = await supabase.from("chat_logs").insert({
    user_id: userId,
    role: "assistant",
    message: text,
    context,
  });
  if (error) {
    console.error(error);
    return false;
  }
  return true;
}
