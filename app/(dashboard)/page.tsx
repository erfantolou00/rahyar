import type { Metadata } from "next";
import { AllocationDeviationPanel } from "@/components/allocation-deviation-panel";
import { PageHeader, SchemaNotice } from "@/components/chrome";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { RefreshPricesButton } from "@/components/refresh-prices-button";
import { deviationsForSnapshot } from "@/lib/finance/allocation-alerts";
import { performanceSeries, sincePriorClose } from "@/lib/finance/book-history";
import { todayKey } from "@/lib/finance/holding-growth";
import { loadBasket, loadBook, readRows } from "@/lib/finance/queries";
import { syncBookClose } from "@/lib/finance/snapshots";
import type { Alert, Transaction } from "@/lib/finance/types";
import { liveOverviewSource } from "@/lib/overview/live";
import { sampleOverviewSource } from "@/lib/overview/sample";
import { buildOverviewView } from "@/lib/overview/view";
import { requireSession } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "نمای کلی" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const preview = params.preview === "1";
  const { supabase, userId } = await requireSession();
  const book = await loadBook(supabase, userId);
  if (!book.ok && !preview) return <SchemaNotice missing={book.missingSchema} />;

  const basket = book.ok ? await loadBasket(supabase, userId) : null;
  const [transactions, alerts] = await Promise.all([
    readRows<Transaction>(
      supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(5),
    ),
    readRows<Alert>(supabase.from("alerts").select("*").eq("user_id", userId).eq("is_active", true)),
  ]);
  const deviations = book.ok ? deviationsForSnapshot(book.data.snapshot, book.data.allocations) : [];
  const emptyBook =
    (!book.ok || book.data.snapshot.holdings.length === 0) && transactions.ok && transactions.data.length === 0;
  const symbols = new Map((book.ok ? book.data.snapshot.holdings : []).map((holding) => [holding.id, holding.symbol]));
  const today = todayKey();
  const stored =
    !preview && basket?.ok && basket.data.rows.length > 0 ? await syncBookClose(supabase, userId, basket.data) : null;
  const liveTotal = basket?.ok ? basket.data.totalValue : book.ok ? book.data.snapshot.totalValue : 0;
  const move = stored ? sincePriorClose(stored.totals, today, liveTotal) : null;
  const series = stored ? performanceSeries(stored.totals, today, liveTotal) : [];
  const source =
    preview || emptyBook || !book.ok
      ? sampleOverviewSource(preview ? "preview" : "empty")
      : liveOverviewSource({
          totalValue: book.data.snapshot.totalValue,
          holdingsCount: book.data.snapshot.holdings.length,
          totalAbsolute: basket?.ok ? basket.data.totalAbsolute : null,
          totalPercent: basket?.ok ? basket.data.totalPercent : null,
          todayAbsolute: move?.absolute ?? null,
          todayPercent: move?.percent ?? null,
          series: series.map((point) => ({ at: point.day, value: point.value })),
          seriesCaption: stored?.caption ?? "هنوز ارزش شبانه‌ای ثبت نشده است.",
          byType: book.data.snapshot.byType,
          alerts: alerts.ok ? alerts.data : null,
          transactions: transactions.ok ? transactions.data : null,
          symbols,
        });
  const view = buildOverviewView(source);

  return (
    <div>
      <PageHeader
        title="نمای کلی"
        description="ارزش دفتر از آخرین قیمت ثبت‌شده حساب می‌شود. سود امروز از بستن شب قبل می‌آید و باز کردن این صفحه منتظر قیمت جدید نمی‌ماند."
        action={<RefreshPricesButton returnTo="/" />}
      />
      <OverviewDashboard view={view} />
      <div className={view.sample ? "mt-8" : "mt-4"}>
        {view.sample ? (
          <p className="mb-3 text-xs text-muted-foreground">وضعیت واقعی دفتر، جدا از اعداد نمونه بالا</p>
        ) : null}
        <AllocationDeviationPanel deviations={deviations} ready={book.ok} />
      </div>
    </div>
  );
}
