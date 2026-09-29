import type { Metadata } from "next";
import { EmptyState, Field, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/chrome";
import { createAlert, retryTelegramDelivery, setAlertActive, setAlertFrequency, setTelegramChatId } from "@/app/(dashboard)/alerts/actions";
import { formatNumber, toNumber } from "@/lib/finance/format";
import { alertKindLabels, notifyFrequencyLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
import { alertKinds, notifyFrequencies, type Alert, type AlertFrequency, type UserSettings } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "هشدارها" };

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache|does not exist|could not find the table/i.test(error.message ?? "")
  );
}

function telegramStatus(value: string | undefined): string | null {
  if (!value) return null;
  const [sent, failed, waiting, skipped] = value.split("-").map((part) => Number(part));
  if ([sent, failed, waiting, skipped].some((count) => !Number.isInteger(count) || count < 0)) return null;
  return `تلگرام: ${formatNumber(sent, 0)} ارسال شد، ${formatNumber(failed, 0)} ناموفق، ${formatNumber(waiting, 0)} منتظر تناوب، ${formatNumber(skipped, 0)} خاموش.`;
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; telegram?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [alerts, settingsResult, frequencies] = await Promise.all([
    readRows<Alert>(supabase.from("alerts").select("*").order("rule")),
    supabase.from("settings").select("*").maybeSingle(),
    readRows<AlertFrequency>(supabase.from("alert_frequencies").select("*")),
  ]);
  const settings = settingsResult.data as UserSettings | null;
  const frequencyByKind = new Map((frequencies.ok ? frequencies.data : []).map((row) => [row.kind, row]));
  const deliveryNote = telegramStatus(params.telegram);

  return (
    <div>
      <PageHeader
        title="هشدارها"
        description="قاعده‌هایی که خودتان می‌نویسید. انحراف تخصیص جداگانه در نمای کلی نشان داده می‌شود و فقط یک جملهٔ پیشنهادی است؛ دکمه‌ای برای خرید یا فروش ندارد."
      />
      <Notice message={errorMessage(params.error)} />
      {deliveryNote ? <p className="mb-4 text-sm leading-7 text-muted-foreground">{deliveryNote}</p> : null}
      {!alerts.ok ? (
        <SchemaNotice missing={alerts.missingSchema} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel title="قواعد">
            {alerts.data.filter((alert) => alert.kind !== "allocation_deviation").length === 0 ? (
              <EmptyState>هشداری تعریف نشده است.</EmptyState>
            ) : (
              <ul className="grid gap-3">
                {alerts.data
                  .filter((alert) => alert.kind !== "allocation_deviation")
                  .map((alert) => (
                  <li key={alert.id} className="flex items-start justify-between gap-3 border-b border-line pb-3 text-sm">
                    <div>
                      <p className="font-medium">{alert.rule}</p>
                      <p className="mt-1 text-muted-foreground">
                        آستانه <span className="numeric">{formatNumber(toNumber(alert.threshold))}</span>
                        {" · "}
                        {alert.channel}
                        {" · "}
                        {alert.frequency}
                        {" · "}
                        {alert.is_active ? "فعال" : "خاموش"}
                        {" · "}
                        {alert.sent ? "تلگرام ارسال شد" : "تلگرام در انتظار"}
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
              <Field label="یادداشت تناوب">
                <input name="frequency" required maxLength={40} defaultValue="daily" className="field-input" />
              </Field>
              <p className="text-xs leading-6 text-muted-foreground">
                این متن فقط روی کارت قاعده دیده می‌شود. زمان ارسال تلگرام از تناوب نوع هشدار در بخش پایین پیروی می‌کند.
              </p>
              <SubmitButton>ثبت هشدار</SubmitButton>
            </form>
          </Panel>
        </div>
      )}
      <div className="mt-4">
        {settingsResult.error || !frequencies.ok ? (
          <SchemaNotice
            missing={!frequencies.ok ? frequencies.missingSchema : isMissingSchema(settingsResult.error)}
          />
        ) : (
          <Panel title="تلگرام">
            <p className="mb-4 text-sm leading-7 text-muted-foreground">
              شناسه گفتگو یک بار ذخیره می‌شود. قبل از هر ارسال، تناوب همان نوع هشدار چک می‌شود.
              اگر تلگرام پیام را نپذیرد، هشدار ارسال‌نشده می‌ماند تا تلاش بعدی.
            </p>
            {settings?.telegram_chat_id ? (
              <p className="text-sm">
                شناسه گفتگو:{" "}
                <span className="numeric" dir="ltr">
                  {settings.telegram_chat_id}
                </span>
              </p>
            ) : (
              <form action={setTelegramChatId} className="grid max-w-sm gap-3">
                <Field label="شناسه گفتگو">
                  <input
                    name="telegram_chat_id"
                    required
                    inputMode="numeric"
                    dir="ltr"
                    className="field-input text-left"
                    placeholder="123456789"
                  />
                </Field>
                <SubmitButton>ثبت شناسه</SubmitButton>
              </form>
            )}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {alertKinds.map((kind) => (
                <form key={kind} action={setAlertFrequency} className="grid gap-3">
                  <input type="hidden" name="kind" value={kind} />
                  <Field label={alertKindLabels[kind]}>
                    <select
                      name="frequency"
                      defaultValue={frequencyByKind.get(kind)?.frequency ?? "immediate"}
                      className="field-input"
                    >
                      {notifyFrequencies.map((frequency) => (
                        <option key={frequency} value={frequency}>
                          {notifyFrequencyLabels[frequency]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <SubmitButton>ذخیره تناوب</SubmitButton>
                </form>
              ))}
            </div>
            <form action={retryTelegramDelivery} className="mt-4">
              <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm">
                ارسال هشدارهای معوق
              </button>
            </form>
          </Panel>
        )}
      </div>
    </div>
  );
}
