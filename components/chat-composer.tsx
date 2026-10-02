"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ChatComposer() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || pending) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const payload = (await response.json()) as { stored?: boolean; message?: string };
      if (payload.stored) {
        setMessage("");
        router.refresh();
      }
      if (!response.ok) {
        setError(payload.message ?? "پاسخ مدل دریافت نشد.");
      }
    } catch {
      setError("ارتباط با سرور قطع شد. دوباره تلاش کنید.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <textarea
        name="message"
        required
        maxLength={2000}
        rows={4}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        disabled={pending}
        className="field-input"
        aria-label="پیام شما"
      />
      {error ? <p className="text-sm leading-7 text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "در حال پاسخ…" : "ارسال"}
      </button>
    </form>
  );
}
