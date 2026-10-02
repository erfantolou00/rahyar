import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/chrome";
import { captureReport, createWeeklyReport } from "@/app/(dashboard)/reports/actions";
import { formatMoney, formatNumber, formatTimestamp } from "@/lib/finance/format";
import { reportTypeLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
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
  const reports = await readRows<Report>(
    supabase.from("reports").select("*").order("created_at", { ascending: false }),
  );

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
              <button
                type="submit"
                className="rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent-soft"
              >
                ساخت گزارش لحظه‌ای
              </button>
            </form>
          </div>
          {reports.data.length === 0 ? (
            <Panel>
              <EmptyState>گزارشی ذخیره نشده است.</EmptyState>
            </Panel>
          ) : (
            <ul className="grid gap-3">
              {reports.data.map((report) => {
                const weekly = parseWeeklyContent(report.content);
                return (
                  <li key={report.id}>
                    <Link
                      href={`/reports/${report.id}`}
                      className="block rounded-2xl border border-line bg-card p-4 shadow-sm hover:bg-accent-soft"
                    >
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
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">تصویر ذخیره‌شده دفتر</p>
                      )}
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
