import type { Metadata } from "next";
import { EmptyState, Field, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/ui";
import { createAlert, setAlertActive } from "@/app/(dashboard)/alerts/actions";
import { formatNumber, toNumber } from "@/lib/finance/format";
import { readRows } from "@/lib/finance/queries";
import type { Alert } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "هشدارها" };

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const alerts = await readRows<Alert>(supabase.from("alerts").select("*").order("rule"));

  return (
    <div>
      <PageHeader title="هشدارها" description="قاعده، آستانه، کانال و تناوب. ارسال خودکار در این نسخه وصل نشده است." />
      <Notice message={errorMessage(params.error)} />
      {!alerts.ok ? (
        <SchemaNotice missing={alerts.missingSchema} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel title="قواعد">
            {alerts.data.length === 0 ? (
              <EmptyState>هشداری تعریف نشده است.</EmptyState>
            ) : (
              <ul className="grid gap-3">
                {alerts.data.map((alert) => (
                  <li key={alert.id} className="flex items-start justify-between gap-3 border-b border-line pb-3 text-sm">
                    <div>
                      <p className="font-medium">{alert.rule}</p>
                      <p className="mt-1 text-muted">
                        آستانه <span className="numeric">{formatNumber(toNumber(alert.threshold))}</span>
                        {" · "}
                        {alert.channel}
                        {" · "}
                        {alert.frequency}
                        {" · "}
                        {alert.is_active ? "فعال" : "خاموش"}
                      </p>
                    </div>
                    <form action={setAlertActive}>
                      <input type="hidden" name="id" value={alert.id} />
                      <input type="hidden" name="is_active" value={alert.is_active ? "false" : "true"} />
                      <button type="submit" className="rounded-lg border border-line px-2 py-1 text-xs">
                        {alert.is_active ? "خاموش" : "روشن"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="هشدار جدید">
            <form action={createAlert} className="grid gap-3">
              <Field label="قاعده">
                <input name="rule" required maxLength={200} className="field-input" placeholder="وزن طلا از حداکثر گذشت" />
              </Field>
              <Field label="آستانه">
                <input name="threshold" required inputMode="decimal" dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="کانال">
                <input name="channel" required maxLength={40} defaultValue="in_app" className="field-input" />
              </Field>
              <Field label="تناوب">
                <input name="frequency" required maxLength={40} defaultValue="daily" className="field-input" />
              </Field>
              <SubmitButton>ثبت هشدار</SubmitButton>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
