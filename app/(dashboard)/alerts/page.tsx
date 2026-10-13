import type { Metadata } from "next";
import {
  deleteManualAlert,
  linkBaleChat,
  retryAlertDelivery,
  setAlertFrequencies,
  setBaleChatId,
} from "@/app/(dashboard)/alerts/actions";
import { EnablePushButton } from "@/components/enable-push-button";
import {
  Field,
  Notice,
  PageHeader,
  Panel,
  SchemaNotice,
  SubmitButton,
  errorMessage,
  quietControlClass,
} from "@/components/chrome";
import { formatNumber } from "@/lib/finance/format";
import { alertKindLabels, notifyFrequencyLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
import {
  notifyFrequencies,
  type Alert,
  type AlertFrequency,
  type AlertKind,
  type PushSubscriptionRecord,
  type UserSettings,
} from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "هشدارها" };

const deliveryKinds = ["allocation_deviation", "codal_notice"] as const satisfies readonly AlertKind[];

function deliveryStatus(value: string | undefined): string | null {
  if (!value) return null;
  const [sent, failed, waiting, skipped] = value.split("-").map((part) => Number(part));
  if ([sent, failed, waiting, skipped].some((count) => !Number.isInteger(count) || count < 0)) return null;
  return `اعلان: ${formatNumber(sent, 0)} ارسال شد، ${formatNumber(failed, 0)} ناموفق، ${formatNumber(waiting, 0)} منتظر تناوب، ${formatNumber(skipped, 0)} خاموش.`;
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; delivery?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [alerts, frequencies, subscriptions, settings] = await Promise.all([
    readRows<Alert>(supabase.from("alerts").select("*").order("created_at", { ascending: false })),
    readRows<AlertFrequency>(supabase.from("alert_frequencies").select("*")),
    readRows<PushSubscriptionRecord>(
      supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth, created_at"),
    ),
    readRows<UserSettings>(supabase.from("settings").select("user_id, bale_chat_id, created_at, updated_at")),
  ]);
  const frequencyByKind = new Map((frequencies.ok ? frequencies.data : []).map((row) => [row.kind, row]));
  const deliveryNote = deliveryStatus(params.delivery);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const baleReady = Boolean(process.env.BALE_BOT_TOKEN?.trim());
  const baleChatId = settings.ok ? settings.data[0]?.bale_chat_id ?? null : null;
  const openAlerts = alerts.ok ? alerts.data.filter((alert) => alert.kind !== "rule" && alert.is_active) : [];
  const manualAlerts = alerts.ok ? alerts.data.filter((alert) => alert.kind === "rule") : [];

  return (
    <div>
      <PageHeader
        title="هشدارها"
        description="انحراف تخصیص و خبر کدال، با تناوبی که اینجا می‌گذارید، به بله و اعلان مرورگر می‌رود."
      />
      <Notice message={errorMessage(params.error)} />
      {deliveryNote ? <p className="mb-4 text-sm leading-7 text-muted-foreground">{deliveryNote}</p> : null}

      {!alerts.ok ? <SchemaNotice missing={alerts.missingSchema} /> : null}

      {frequencies.ok && subscriptions.ok && settings.ok ? (
        <div className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="اعلان مرورگر">
              <EnablePushButton publicKey={vapidPublicKey} registered={subscriptions.data.length} />
              <form action={retryAlertDelivery} className="mt-4">
                <button type="submit" className={quietControlClass}>
                  ارسال هشدارهای معوق
                </button>
              </form>
            </Panel>
            <Panel title="بله">
              {baleReady ? (
                <div className="grid gap-3">
                  <p className="text-sm leading-7 text-muted-foreground">
                    شناسه گفتگوی خودتان در بازو.
                    {baleChatId ? ` ذخیره‌شده: ${baleChatId}` : ""}
                  </p>
                  <form action={setBaleChatId} className="grid gap-3">
                    <Field label="شناسه گفتگو">
                      <input
                        name="chat_id"
                        required
                        inputMode="numeric"
                        dir="ltr"
                        defaultValue={baleChatId ?? ""}
                        className="field-input text-start"
                      />
                    </Field>
                    <SubmitButton>ذخیره شناسه</SubmitButton>
                  </form>
                  <form action={linkBaleChat}>
                    <button type="submit" className={quietControlClass}>
                      خواندن از بله
                    </button>
                  </form>
                </div>
              ) : (
                <p className="text-sm leading-7 text-muted-foreground">توکن بازو در سرور تنظیم نشده است.</p>
              )}
            </Panel>
          </div>

          <Panel title="تناوب">
            <form action={setAlertFrequencies} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {deliveryKinds.map((kind) => (
                  <Field key={kind} label={alertKindLabels[kind]}>
                    <select
                      name={kind}
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
                ))}
              </div>
              <SubmitButton>ذخیره تناوب</SubmitButton>
            </form>
          </Panel>

          {openAlerts.length > 0 ? (
            <Panel title="هشدارهای باز">
              <ul className="grid gap-3">
                {openAlerts.map((alert) => (
                  <li key={alert.id} className="border-b border-line pb-3 text-sm last:border-b-0 last:pb-0">
                    <p className="text-muted-foreground">{alertKindLabels[alert.kind]}</p>
                    <p className="mt-1 leading-7">{alert.message || alert.rule}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {manualAlerts.length > 0 ? (
            <Panel title="قاعده‌های قبلی">
              <ul className="grid gap-3">
                {manualAlerts.map((alert) => (
                  <li key={alert.id} className="flex items-center justify-between gap-3 text-sm">
                    <p>{alert.message || alert.rule}</p>
                    <form action={deleteManualAlert}>
                      <input type="hidden" name="id" value={alert.id} />
                      <button type="submit" className={quietControlClass}>
                        حذف
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : (
        <SchemaNotice
          missing={
            !frequencies.ok
              ? frequencies.missingSchema
              : !subscriptions.ok
                ? subscriptions.missingSchema
                : !settings.ok
                  ? settings.missingSchema
                  : false
          }
        />
      )}
    </div>
  );
}
