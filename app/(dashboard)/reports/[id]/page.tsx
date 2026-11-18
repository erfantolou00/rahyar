import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { interpretStatusMessage } from "@/lib/ai/interpret-weekly";
import { PageHeader, Panel, SchemaNotice } from "@/components/chrome";
import { InterpretReportButton } from "@/components/interpret-report-button";
import { WeeklyReportView } from "@/components/weekly-report-view";
import { formatTimestamp } from "@/lib/finance/format";
import { reportTypeLabels } from "@/lib/finance/labels";
import type { Report } from "@/lib/finance/types";
import { parseWeeklyContent } from "@/lib/finance/weekly";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "جزئیات گزارش" };

const channels = ["sent", "failed", "skipped"] as const;

function deliveryNote(value: string | undefined): string | null {
  if (!value) return null;
  const [bale, push] = value.split("-");
  if (!channels.some((channel) => channel === bale) || !channels.some((channel) => channel === push)) return null;
  const label = { sent: "ارسال شد", failed: "ناموفق بود", skipped: "وصل نیست" } as const;
  return `بله: ${label[bale as (typeof channels)[number]]}. اعلان مرورگر: ${label[push as (typeof channels)[number]]}.`;
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ delivery?: string; interpret?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(error);
    const missing = error.code === "PGRST205" || error.code === "42P01";
    return <SchemaNotice missing={missing} />;
  }
  if (!data) notFound();

  const report = data as Report;
  const weekly = parseWeeklyContent(report.content);
  const note = deliveryNote(query.delivery);
  const interpretNote = interpretStatusMessage(query.interpret);

  return (
    <div>
      <PageHeader
        title={`${reportTypeLabels[report.type]} · ${formatTimestamp(report.created_at)}`}
        description="عددهای همین گزارش همان‌طور که ذخیره شده‌اند نشان داده می‌شوند."
        action={
          <Link href="/reports" className="text-sm text-muted-foreground underline underline-offset-4">
            بازگشت به فهرست
          </Link>
        }
      />
      {note ? <p className="mb-4 text-sm leading-7 text-muted-foreground">{note}</p> : null}
      {interpretNote ? <p className="mb-4 text-sm leading-7 text-danger">{interpretNote}</p> : null}
      {weekly && !weekly.commentary ? <div className="mb-4"><InterpretReportButton reportId={report.id} /></div> : null}
      {report.type === "weekly" && weekly ? (
        <WeeklyReportView content={weekly} />
      ) : (
        <Panel title="محتوا">
          <pre className="numeric overflow-x-auto text-left text-xs leading-6" dir="ltr">
            {JSON.stringify(report.content, null, 2)}
          </pre>
        </Panel>
      )}
    </div>
  );
}
