"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InterpretReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function interpret() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/reports/interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(payload.message ?? "تفسیر انجام نشد.");
        return;
      }
      router.refresh();
    } catch {
      setError("ارتباط با سرور قطع شد. دوباره تلاش کنید.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={interpret}
        disabled={pending}
        className="w-fit rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent-soft disabled:opacity-60"
      >
        {pending ? "در حال تفسیر…" : "تفسیر پنج‌خطی همین گزارش"}
      </button>
      {error ? <p className="text-sm leading-7 text-danger">{error}</p> : null}
    </div>
  );
}
