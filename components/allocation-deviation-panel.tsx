import Link from "next/link";
import type { AllocationDeviation } from "@/lib/finance/allocation-deviation";

export function AllocationDeviationPanel({
  deviations,
  ready,
}: {
  deviations: AllocationDeviation[];
  ready: boolean;
}) {
  const flagged = ready && deviations.length > 0;

  return (
    <section
      aria-label="انحراف از بازه‌ی تخصیص"
      className={
        flagged
          ? "rounded-2xl border-2 border-warn bg-warn/10 p-4 shadow-sm"
          : "rounded-2xl border border-line bg-card p-4 shadow-sm"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-semibold">انحراف از بازه‌ی تخصیص</h2>
        <Link href="/allocations" className="inline-flex h-11 items-center text-sm underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          تنظیم بازه‌ها
        </Link>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
        این بخش فقط پیشنهاد متنی است. هیچ خرید، فروش یا جابه‌جایی‌ای ساخته نمی‌شود و سبد خودبه‌خود عوض نمی‌شود.
      </p>
      {flagged ? (
        <ul className="mt-4 grid gap-2">
          {deviations.map((row) => (
            <li
              key={row.assetType}
              className="rounded-xl border border-warn/30 bg-card px-3 py-2 text-sm leading-7"
            >
              {row.message}
            </li>
          ))}
        </ul>
      ) : ready ? (
        <p className="mt-4 text-sm leading-7">همهٔ وزن‌های فعلی داخل بازه‌ی مجاز هستند.</p>
      ) : (
        <p className="mt-4 text-sm leading-7">بازه‌های تخصیص خوانده نشد، پس انحرافی محاسبه نشده است.</p>
      )}
    </section>
  );
}
