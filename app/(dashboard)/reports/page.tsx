import type { Metadata } from "next";
import { EmptyState, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/ui";
import { captureReport } from "@/app/(dashboard)/reports/actions";
import { formatTimestamp } from "@/lib/finance/format";
import { reportTypeLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
import type { Report } from "@/lib/finance/types";
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
        description="محتوا به‌صورت JSON ذخیره می‌شود. این دکمه یک تصویر لحظه‌ای از دفتر می‌سازد."
      />
      <Notice message={errorMessage(params.error)} />
      {!reports.ok ? (
        <SchemaNotice missing={reports.missingSchema} />
      ) : (
        <div className="grid gap-4">
          <form action={captureReport}>
            <SubmitButton>ساخت گزارش لحظه‌ای</SubmitButton>
          </form>
          {reports.data.length === 0 ? (
            <Panel>
              <EmptyState>گزارشی ذخیره نشده است.</EmptyState>
            </Panel>
          ) : (
            reports.data.map((report) => (
              <Panel key={report.id} title={`${reportTypeLabels[report.type]} · ${formatTimestamp(report.created_at)}`}>
                <pre className="numeric overflow-x-auto text-left text-xs leading-6" dir="ltr">
                  {JSON.stringify(report.content, null, 2)}
                </pre>
              </Panel>
            ))
          )}
        </div>
      )}
    </div>
  );
}
