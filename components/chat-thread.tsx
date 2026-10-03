"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { readReplyWarnings, replyBody, type ReplyWarning } from "@/lib/ai/reply-warnings";
import { ReplyWarnings } from "@/components/reply-warnings";
import type { ChatRole, Json } from "@/lib/finance/types";

export type ChatTurn = {
  id: string;
  role: ChatRole;
  message: string;
  timestamp: string;
  model: string | null;
  context: Json | null;
};

const suggestions = [
  { title: "خلاصه سبد", text: "وضعیت سبد من را خلاصه کن" },
  { title: "بازده سهام", text: "بازده سهام‌ها را بگو" },
  { title: "هشدارهای فعال", text: "کدام هشدار فعال است؟" },
];

export function ChatThread({ initial }: { initial: ChatTurn[] }) {
  const router = useRouter();
  const [turns, setTurns] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTurns(initial);
  }, [initial]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  function resizeField() {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const localId = `local-${Date.now()}`;
    setTurns((current) => [
      ...current,
      { id: localId, role: "user", message: trimmed, timestamp: new Date().toISOString(), model: null, context: null },
    ]);
    setMessage("");
    if (field.current) field.current.style.height = "auto";
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const payload = (await response.json()) as { stored?: boolean; message?: string; warnings?: ReplyWarning[] };
      if (payload.stored && payload.message) {
        const warnings = readReplyWarnings({ warnings: payload.warnings });
        setTurns((current) => [
          ...current,
          {
            id: `local-reply-${Date.now()}`,
            role: "assistant",
            message: payload.message ?? "",
            timestamp: new Date().toISOString(),
            model: null,
            context: warnings.length > 0 ? { warnings } : null,
          },
        ]);
        router.refresh();
      } else {
        setTurns((current) => current.filter((turn) => turn.id !== localId));
        setMessage(trimmed);
        setError(payload.message ?? "پاسخ مدل دریافت نشد.");
      }
    } catch {
      setTurns((current) => current.filter((turn) => turn.id !== localId));
      setMessage(trimmed);
      setError("ارتباط با سرور قطع شد. دوباره تلاش کنید.");
    } finally {
      setPending(false);
      field.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(message);
    }
  }

  const empty = turns.length === 0 && !pending;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line/80 bg-card/80 px-4 py-3 backdrop-blur">
        <AssistantMark />
        <div className="min-w-0">
          <p className="text-sm font-semibold">رهیار</p>
          <p className="truncate text-xs text-muted-foreground">پاسخ فقط از سبد، هشدارها و گزارش‌های شما</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto flex w-full max-w-3xl flex-col px-4 py-6 ${empty ? "min-h-full" : "gap-5"}`}>
          {empty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
              <AssistantMark large />
              <div className="grid gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">چطور کمک کنم؟</h2>
                <p className="mx-auto max-w-md text-sm leading-7 text-muted-foreground">
                  عددها از سبد، هشدارها و گزارش هفتگی خوانده می‌شوند. عدد تازه‌ای ساخته نمی‌شود.
                </p>
              </div>
              <div className="grid w-full max-w-xl gap-2 sm:grid-cols-3">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.text}
                    type="button"
                    onClick={() => void send(suggestion.text)}
                    className="rounded-2xl border border-line bg-card px-3 py-3 text-start text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <span className="block text-xs font-medium text-primary">{suggestion.title}</span>
                    <span className="mt-1 block leading-6 text-foreground">{suggestion.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn) => <Turn key={turn.id} turn={turn} />)
          )}
          {pending ? <Typing /> : null}
          <div ref={bottom} />
        </div>
      </div>

      <form
        className="bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(message);
        }}
      >
        <div className="mx-auto w-full max-w-3xl rounded-[1.6rem] border border-line bg-card p-2 shadow-[0_12px_40px_-18px_rgba(79,70,229,0.45)]">
          <div className="flex items-end gap-2 px-2">
            <textarea
              ref={field}
              name="message"
              rows={1}
              maxLength={2000}
              value={message}
              disabled={pending}
              onChange={(event) => {
                setMessage(event.target.value);
                resizeField();
              }}
              onKeyDown={onKeyDown}
              placeholder="پیام بنویسید…"
              aria-label="پیام شما"
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-sm leading-7 outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={pending || message.trim().length === 0}
              aria-label="ارسال"
              className="mb-1 grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-brand-2 text-primary-foreground shadow-md shadow-primary/25 transition hover:opacity-95 disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
          <p className="px-3 pb-1 text-[11px] leading-5 text-muted-foreground">برای ارسال اینتر را بزنید. برای خط جدید، شیفت و اینتر.</p>
        </div>
        {error ? <p className="mx-auto mt-2 w-full max-w-3xl text-sm leading-7 text-danger">{error}</p> : null}
      </form>
    </div>
  );
}

function AssistantMark({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-brand-2 text-primary-foreground shadow-md shadow-primary/20 ${
        large ? "size-14" : "size-9"
      }`}
    >
      <Sparkles className={large ? "size-6" : "size-4"} />
    </span>
  );
}

function Typing() {
  return (
    <article className="flex items-start gap-3" aria-live="polite">
      <AssistantMark />
      <div className="min-w-0">
        <p className="mb-1.5 text-xs font-semibold">رهیار</p>
        <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-ss-md border border-line bg-card px-4 py-3 shadow-sm">
          <span className="sr-only">در حال نوشتن</span>
          <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
        </div>
      </div>
    </article>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  const time = formatTime(turn.timestamp);

  if (turn.role === "user") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[min(100%,34rem)]">
          <div className="whitespace-pre-wrap rounded-2xl rounded-es-md bg-gradient-to-br from-primary to-[#3730a3] px-4 py-2.5 text-sm leading-7 text-primary-foreground shadow-sm">
            <MessageText text={turn.message} />
          </div>
          {time ? <p className="mt-1 px-1 text-[11px] text-muted-foreground">{time}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <article className="flex items-start gap-3">
      <AssistantMark />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
          <p className="text-xs font-semibold">رهیار</p>
          {turn.model ? <p className="text-[11px] text-muted-foreground">{turn.model}</p> : null}
          {time ? <p className="text-[11px] text-muted-foreground">{time}</p> : null}
        </div>
        <div className="rounded-2xl rounded-ss-md border border-line bg-card px-4 py-3 text-sm leading-8 shadow-sm">
          <MessageText text={replyBody(turn.message, turn.context)} />
          <ReplyWarnings warnings={readReplyWarnings(turn.context)} />
        </div>
        {turn.context ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">داده‌ای که مدل دیده است</summary>
            <pre className="numeric mt-2 max-h-60 overflow-auto rounded-xl bg-muted/70 p-3 text-left text-xs leading-6" dir="ltr">
              {JSON.stringify(turn.context, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function MessageText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={index} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(date);
}
