import type { Metadata } from "next";
import { AllocationDeviationPanel } from "@/components/allocation-deviation-panel";
import { PageHeader, SchemaNotice } from "@/components/chrome";
import { MacroPanel } from "@/components/macro-panel";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { RefreshPricesButton } from "@/components/refresh-prices-button";
import { deviationsForSnapshot, syncAllocationDeviationAlerts } from "@/lib/finance/allocation-alerts";
import { performanceSeries, sincePriorClose } from "@/lib/finance/book-history";
import { todayKey } from "@/lib/finance/holding-growth";
import { presentMacro } from "@/lib/finance/macro/present";
import { loadBasket, loadPortfolio, readRows } from "@/lib/finance/queries";
import { syncBookClose } from "@/lib/finance/snapshots";
import type { Alert, Allocation, MacroIndicatorRow, Transaction } from "@/lib/finance/types";
import { liveOverviewSource } from "@/lib/overview/live";
import { sampleOverviewSource } from "@/lib/overview/sample";
import { buildOverviewView } from "@/lib/overview/view";
import { userIdFromClaims } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "نمای کلی" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const preview = params.preview === "1";
  const supabase = await createClient();
  const [portfolio, transactions, alerts, allocationRows, macroRows] = await Promise.all([
    loadPortfolio(supabase),
    readRows<Transaction>(
      supabase.from("transactions").select("*").order("date", { ascending: false }).limit(5),
    ),
    readRows<Alert>(supabase.from("alerts").select("*").eq("is_active", true)),
    readRows<Allocation>(supabase.from("allocations").select("*")),
    readRows<Pick<MacroIndicatorRow, "indicator" | "value" | "date" | "source">>(
      supabase.from("macro_indicators").select("indicator,value,date,source").order("date", { ascending: false }),
    ),
  ]);

  if (!portfolio.ok && !preview) return <SchemaNotice missing={portfolio.missingSchema} />;

  const claims = preview ? null : await supabase.auth.getClaims();
  const userId = userIdFromClaims(claims?.data?.claims);
  const basket = portfolio.ok ? await loadBasket(supabase) : null;
  const deviations =
    portfolio.ok && allocationRows.ok ? deviationsForSnapshot(portfolio.data, allocationRows.data) : [];
  const canSync = portfolio.ok && allocationRows.ok && Boolean(userId);
  const saved = canSync && userId ? await syncAllocationDeviationAlerts(supabase, userId, deviations) : null;
  const saveState = !canSync || saved == null || saved.ok
    ? "saved"
    : saved.missingSchema
      ? "missing"
      : "failed";
  const macro = macroRows.ok ? presentMacro(macroRows.data) : null;
  const emptyBook =
    portfolio.ok &&
    transactions.ok &&
    portfolio.data.holdings.length === 0 &&
    transactions.data.length === 0;
  const symbols = new Map(
    (portfolio.ok ? portfolio.data.holdings : []).map((holding) => [holding.id, holding.symbol]),
  );
  const today = todayKey();
  const book =
    userId && basket?.ok && basket.data.rows.length > 0
      ? await syncBookClose(supabase, userId, basket.data)
      : null;
  const liveTotal = basket?.ok ? basket.data.totalValue : portfolio.ok ? portfolio.data.totalValue : 0;
  const move = book ? sincePriorClose(book.totals, today, liveTotal) : null;
  const series = book ? performanceSeries(book.totals, today, liveTotal) : [];
  const source =
    preview || emptyBook || !portfolio.ok
      ? sampleOverviewSource(preview ? "preview" : "empty")
      : liveOverviewSource({
          totalValue: portfolio.data.totalValue,
          holdingsCount: portfolio.data.holdings.length,
          totalAbsolute: basket?.ok ? basket.data.totalAbsolute : null,
          totalPercent: basket?.ok ? basket.data.totalPercent : null,
          todayAbsolute: move?.absolute ?? null,
          todayPercent: move?.percent ?? null,
          series: series.map((point) => ({ at: point.day, value: point.value })),
          seriesCaption: book?.caption ?? "هنوز ارزش شبانه‌ای ثبت نشده است.",
          byType: portfolio.data.byType,
          alerts: alerts.ok ? alerts.data : null,
          transactions: transactions.ok ? transactions.data : null,
          symbols,
        });
  const view = buildOverviewView(source);

  return (
    <div>
      <PageHeader
        title="نمای کلی"
        description="ارزش دفتر از آخرین قیمت ثبت‌شده حساب می‌شود. سود امروز وقتی قیمت دیروز موجود باشد نشان داده می‌شود."
        action={<RefreshPricesButton returnTo="/" />}
      />
      <OverviewDashboard view={view} />
      <div className={view.sample ? "mt-8" : "mt-4"}>
        {view.sample ? (
          <p className="mb-3 text-xs text-muted-foreground">وضعیت واقعی دفتر، جدا از اعداد نمونه بالا</p>
        ) : null}
        <AllocationDeviationPanel
          deviations={deviations}
          ready={allocationRows.ok}
          saveState={saveState}
        />
      </div>
      <div className="mt-4">
        <MacroPanel
          cards={macro?.cards ?? []}
          empty={macro?.empty ?? false}
          schemaIssue={macroRows.ok ? null : macroRows.missingSchema}
        />
      </div>
    </div>
  );
}
