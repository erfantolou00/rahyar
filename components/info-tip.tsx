"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

export function InfoTip({ text }: { text: string }) {
  const id = useId();
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);

  function show(target: HTMLButtonElement) {
    const rect = target.getBoundingClientRect();
    setTip({ top: rect.top, left: rect.left + rect.width / 2 });
  }

  return (
    <>
      <button
        type="button"
        aria-label="نام کامل منبع"
        aria-describedby={tip ? id : undefined}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent-soft hover:text-foreground"
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={() => setTip(null)}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={() => setTip(null)}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {tip ? (
        <span
          id={id}
          role="tooltip"
          style={{ top: tip.top - 8, left: tip.left }}
          className="pointer-events-none fixed z-50 w-max max-w-72 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-popover px-2.5 py-1.5 text-start text-xs leading-5 text-popover-foreground shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </>
  );
}
