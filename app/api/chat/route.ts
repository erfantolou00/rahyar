import { NextResponse } from "next/server";
import { loadChatFacts } from "@/lib/ai/facts";
import { completeChat, publicModelDetail } from "@/lib/ai/gapgpt";
import type { ChatMessage } from "@/lib/ai/messages";
import { replyUsesKnownNumbers } from "@/lib/ai/numbers";
import type { ReplyWarning } from "@/lib/ai/reply-warnings";
import { chatSystemPrompt } from "@/lib/ai/prompt";
import { CHAT_POLICY, takeRateSlot } from "@/lib/ai/rate-limit";
import { readRows } from "@/lib/finance/queries";
import type { Json } from "@/lib/finance/types";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const USER_MESSAGE_LIMIT = 2000;

function json(
  body: { ok: boolean; stored: boolean; message: string; warnings?: ReplyWarning[] },
  status = 200,
  retryAfter?: number,
) {
  return NextResponse.json(body, {
    status,
    headers: retryAfter ? { "retry-after": String(retryAfter) } : undefined,
  });
}

export async function POST(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return json({ ok: false, stored: false, message: "ابتدا وارد شوید." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, stored: false, message: "پیام خوانده نشد." }, 400);
  }

  const message =
    body && typeof body === "object" && "message" in body
      ? String((body as { message?: unknown }).message ?? "").trim()
      : "";
  if (!message || message.length > USER_MESSAGE_LIMIT) {
    return json({ ok: false, stored: false, message: "پیام خالی است یا طولانی‌تر از حد مجاز است." }, 400);
  }

  const slot = takeRateSlot(`chat:${session.userId}`, Date.now(), CHAT_POLICY);
  if (!slot.ok) {
    return json(
      {
        ok: false,
        stored: false,
        message: `تعداد درخواست به مدل زیاد است. ${slot.retryAfterSeconds} ثانیه بعد دوباره تلاش کنید.`,
      },
      429,
      slot.retryAfterSeconds,
    );
  }

  const facts = await loadChatFacts(session.supabase, session.userId);
  if (!facts.ok) {
    return json({ ok: false, stored: false, message: "وضعیت سبد خوانده نشد. کمی بعد دوباره تلاش کنید." }, 503);
  }

  const seen = facts.data;
  const userSaved = await session.supabase.from("chat_logs").insert({
    user_id: session.userId,
    role: "user",
    message,
    context: { surface: "chat", seen } as Json,
  });
  if (userSaved.error) {
    console.error(userSaved.error);
    return json({ ok: false, stored: false, message: "پیام ذخیره نشد. دوباره تلاش کنید." }, 500);
  }

  const history = await readRows<{ role: string; message: string }>(
    session.supabase
      .from("chat_logs")
      .select("role, message")
      .eq("user_id", session.userId)
      .order("timestamp", { ascending: false })
      .limit(8),
  );
  const prior = (history.ok ? history.data : [])
    .reverse()
    .filter((row) => row.role === "user" || row.role === "assistant");
  const last = prior.at(-1);
  if (last?.role === "user" && last.message === message) prior.pop();

  const messages: ChatMessage[] = [
    { role: "system", content: chatSystemPrompt(seen) },
    ...prior.slice(-6).map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.message.slice(0, 500),
    })),
    { role: "user", content: message },
  ];

  const completion = await completeChat(messages, { maxTokens: 500 });
  let assistant = "مدل الان پاسخ نداد. کمی بعد دوباره تلاش کنید.";
  let accepted = false;
  let errorCode: string | undefined;
  let model: string | null = null;
  const warnings: ReplyWarning[] = [];

  if (!completion.ok) {
    errorCode = completion.reason;
    if (completion.reason === "missing_key") {
      assistant = "کلید گپ‌جی‌پی‌تی روی سرور تنظیم نشده است.";
    } else if (completion.reason === "invalid_key") {
      assistant = "کلید گپ‌جی‌پی‌تی را سرویس رد کرد. یک کلید تازه بگذارید و برنامه را دوباره اجرا کنید.";
    } else if (completion.reason === "timeout") {
      assistant = "مدل در زمان مقرر پاسخ نداد. کمی بعد دوباره تلاش کنید.";
    } else {
      assistant = `مدل الان پاسخ نداد. کمی بعد دوباره تلاش کنید.${publicModelDetail(completion.detail)}`;
    }
  } else {
    model = completion.model;
    assistant = completion.text;
    if (!replyUsesKnownNumbers(completion.text, [seen, message])) warnings.push("numbers");
    accepted = warnings.length === 0;
  }

  const saved = await session.supabase.from("chat_logs").insert({
    user_id: session.userId,
    role: "assistant",
    message: assistant.trim().slice(0, 4000),
    context: {
      surface: "chat",
      model,
      seen,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(errorCode ? { error: errorCode } : {}),
    } as Json,
  });
  if (saved.error) {
    console.error(saved.error);
    return json({ ok: false, stored: true, message: "پاسخ ذخیره نشد. دوباره تلاش کنید." }, 500);
  }

  if (warnings.length > 0) {
    return json({ ok: true, stored: true, message: assistant, warnings });
  }
  const status = accepted
    ? 200
    : errorCode === "missing_key" || errorCode === "invalid_key"
      ? 503
      : errorCode === "timeout"
        ? 504
        : 502;
  return json({ ok: accepted, stored: true, message: assistant }, status);
}
