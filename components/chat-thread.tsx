"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ChatRole, Json } from "@/lib/finance/types";

export type ChatTurn = {
  id: string;
  role: ChatRole;
  message: string;
  timestamp: string;
  model: string | null;
  context: Json | null;
};

const suggestions = ["وضعیت سبد من را خلاصه کن", "بازده سهام‌ها را بگو", "کدام هشدار فعال است؟"];

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
      const payload = (await response.json()) as { stored?: boolean; message?: string };
      if (payload.stored && payload.message) {
        setTurns((current) => [
          ...current,
          {
            id: `local-reply-${Date.now()}`,
            role: "assistant",
            message: payload.message ?? "",
            timestamp: new Date().toISOString(),
            model: null,
            context: null,
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
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(message);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {turns.length === 0 && !pending ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
              <p className="text-2xl font-semibold">چطور کمک کنم؟</p>
              <p className="max-w-md text-sm leading-7 text-muted-foreground">
                پاسخ از سبد، هشدارها، گزارش هفتگی و عددهای سهام ساخته می‌شود. عدد تازه‌ای ساخته نمی‌شود.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-full border border-line bg-card px-3 py-1.5 text-sm hover:bg-accent-soft"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn) => <Turn key={turn.id} turn={turn} />)
          )}
          {pending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">رهیار</span>
              <span className="inline-flex gap-1" aria-hidden>
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
              </span>
            </div>
          ) : null}
          <div ref={bottom} />
        </div>
      </div>
      <form
        className="border-t border-line bg-card/90 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(message);
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-line bg-background px-3 py-2 shadow-sm">
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
            placeholder="پیام بنویسید"
            aria-label="پیام شما"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-7 outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={pending || message.trim().length === 0}
            aria-label="ارسال"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
        {error ? <p className="mx-auto mt-2 w-full max-w-3xl text-sm leading-7 text-danger">{error}</p> : null}
      </form>
    </div>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-start">
        <p className="max-w-[min(100%,36rem)] whitespace-pre-wrap rounded-3xl bg-primary px-4 py-2.5 text-sm leading-7 text-primary-foreground">
          {turn.message}
        </p>
      </div>
    );
  }

  return (
    <article className="grid gap-1">
      <p className="text-xs font-medium text-muted-foreground">{turn.model ? `رهیار · ${turn.model}` : "رهیار"}</p>
      <p className="whitespace-pre-wrap text-sm leading-8">{turn.message}</p>
      {turn.context ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground">داده‌ای که مدل دیده است</summary>
          <pre className="numeric mt-2 max-h-60 overflow-auto text-left text-xs leading-6" dir="ltr">
            {JSON.stringify(turn.context, null, 2)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}
