import type { Metadata } from "next";
import Link from "next/link";
import { AllocationDeviationPanel } from "@/components/allocation-deviation-panel";
import { PageHeader, Panel, SchemaNotice } from "@/components/chrome";
import { RefreshPricesButton } from "@/components/refresh-prices-button";
import { deviationsForSnapshot } from "@/lib/finance/allocation-alerts";
import { formatMoney, formatNumber, formatPercent } from "@/lib/finance/format";
import { portfolioCostChange } from "@/lib/finance/portfolio";
import { loadBook } from "@/lib/finance/queries";
import { requireSession } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "نمای کلی" };

export default async function OverviewPage() {
  const { supabase } = await requireSession();
  const book = await loadBook(supabase);
  if (!book.ok) return <SchemaNotice missing={book.missingSchema} />;

  const deviations = deviationsForSnapshot(book.data.snapshot, book.data.allocations);
  const change = portfolioCostChange(book.data.assets, book.data.snapshot, book.data.prices);
  const sentence = costSentence(change);

  return (
    <div>
      <PageHeader
        title="نمای کلی"
        description="ارزش دفتر، فاصله از میانگین خرید، و طبقه‌هایی که از بازه بیرون‌اند. قیمت روی سرور به‌روز می‌شود و باز کردن این صفحه منتظر قیمت جدید نمی‌ماند."
        action={<RefreshPricesButton returnTo="/" />}
      />
      <Panel>
        <p className="text-sm text-muted-foreground">ارزش دفتر</p>
        <p className="numeric mt-2 text-4xl font-semibold tracking-tight">
          {formatMoney(book.data.snapshot.totalValue)}
        </p>
        <p className={`mt-3 text-sm leading-7 ${sentence.tone}`}>{sentence.text}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          <Link href="/basket" className="underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            سبد دارایی
          </Link>
          <span className="numeric"> · {formatNumber(book.data.snapshot.holdings.length, 0)} دارایی</span>
        </p>
      </Panel>
      <div className="mt-4">
        <AllocationDeviationPanel deviations={deviations} ready />
      </div>
    </div>
  );
}

function costSentence(change: { absolute: number | null; percent: number | null }): { text: string; tone: string } {
  if (change.absolute == null) {
    return {
      text: "میانگین خرید ثبت نشده، پس تغییر نسبت به خرید حساب نمی‌شود.",
      tone: "text-muted-foreground",
    };
  }
  if (change.absolute === 0) {
    return { text: "بدون تغییر نسبت به میانگین خرید.", tone: "text-muted-foreground" };
  }
  const direction = change.absolute > 0 ? "افزایش" : "کاهش";
  const share = change.percent == null ? "" : `، برابر ${formatPercent(Math.abs(change.percent))}`;
  const tone = change.absolute > 0 ? "text-ok" : "text-danger";
  return {
    text: `${direction} ${formatMoney(Math.abs(change.absolute))}${share} نسبت به میانگین خرید.`,
    tone,
  };
}
