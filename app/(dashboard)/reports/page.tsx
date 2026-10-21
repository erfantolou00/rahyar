import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EmptyState, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage, quietControlClass } from "@/components/chrome";
import { FisManualForm } from "@/components/fis-manual-form";
import { captureReport, createWeeklyReport } from "@/app/(dashboard)/reports/actions";
import { parseStoredSheet, type ManualSheet } from "@/lib/finance/fis-manual";
import { parseFisContent } from "@/lib/finance/publish-fis";
import { formatMoney, formatNumber, formatTimestamp } from "@/lib/finance/format";
import { reportTypeLabels } from "@/lib/finance/labels";
import { loadPortfolio, loadStockFundamentals, readRows } from "@/lib/finance/queries";
import type { Report } from "@/lib/finance/types";
import { formatWeekChange, parseWeeklyContent } from "@/lib/finance/weekly";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "گزارش‌ها" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [reports, portfolio, fundamentals] = await Promise.all([
    readRows<Report>(supabase.from("reports").select("*").order("created_at", { ascending: false })),
    loadPortfolio(supabase),
    loadStockFundamentals(supabase),
  ]);
  const stocks = portfolio.ok
    ? [...new Map(
      portfolio.data.holdings
        .filter((holding) => holding.type === "stock" && holding.quantity > 0)
        .map((holding) => [holding.symbol, { symbol: holding.symbol, price: holding.price }]),
    ).values()]
    : [];
  const sheets: Record<string, ManualSheet> = {};
  if (fundamentals.ok) {
    for (const row of fundamentals.data) {
      const sheet = parseStoredSheet(row.manual_sheet);
      if (sheet) sheets[row.symbol] = sheet;
    }
  }

  return (
    <div>
      <PageHeader
        title="گزارش‌ها"
        description="گزارش هفتگی عددهای سبد، سود و زیان، هشدارها و وزن طبقات را ذخیره می‌کند. خلاصه همان گزارش از بله و اعلان مرورگر فرستاده می‌شود، اگر قبلاً وصل شده باشند."
      />
      <Notice message={errorMessage(params.error)} />
      {!reports.ok ? (
        <SchemaNotice missing={reports.missingSchema} />
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <form action={createWeeklyReport}>
              <SubmitButton>ساخت گزارش هفتگی</SubmitButton>
            </form>
            <form action={captureReport}>
              <button type="submit" className={quietControlClass}>
                ساخت گزارش لحظه‌ای
              </button>
            </form>
          </div>
          <Panel title="گزارش بنیادی سهام">
            <FisManualForm stocks={stocks} sheets={sheets} />
          </Panel>
          {reports.data.length === 0 ? (
            <Panel>
              <EmptyState>گزارشی ذخیره نشده است.</EmptyState>
            </Panel>
          ) : (
            <ul className="grid gap-3">
              {reports.data.map((report) => {
                const weekly = parseWeeklyContent(report.content);
                const fis = parseFisContent(report.content);
                return (
                  <li key={report.id}>
                    <Link
                      href={`/reports/${report.id}`}
                      className="surface flex items-center justify-between gap-4 p-4 transition-colors duration-150 outline-none hover:bg-accent-soft focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {reportTypeLabels[report.type]}
                          <span className="numeric text-muted-foreground"> · {formatTimestamp(report.created_at)}</span>
                        </p>
                        {weekly ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            ارزش <span className="numeric">{formatMoney(weekly.portfolio.total_value)}</span>
                            {" · "}
                            <span className="numeric">
                              {formatWeekChange(weekly.portfolio.change_value, weekly.portfolio.change_percent)}
                            </span>
                            {" · "}
                            <span className="numeric">{formatNumber(weekly.alerts.length, 0)}</span>
                            {" هشدار"}
                          </p>
                        ) : fis ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            گزارش بنیادی سهام
                            {" · "}
                            <span className="numeric">{formatNumber(fis.stocks.length, 0)}</span>
                            {" سهم"}
                            {" · "}
                            اخزا <span className="numeric">{formatNumber(fis.akhza_percent, 2)}</span>
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">تصویر ذخیره‌شده دفتر</p>
                        )}
                      </div>
                      <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
