import type { Metadata } from "next";
import { EmptyState, Field, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/chrome";
import { createAlert, linkBaleChat, retryAlertDelivery, setAlertActive, setAlertFrequency, setBaleChatId } from "@/app/(dashboard)/alerts/actions";
import { EnablePushButton } from "@/components/enable-push-button";
import { formatNumber, toNumber } from "@/lib/finance/format";
import { alertKindLabels, notifyFrequencyLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
import { alertKinds, notifyFrequencies, type Alert, type AlertFrequency, type PushSubscriptionRecord, type UserSettings } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "هشدارها" };

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
    readRows<Alert>(supabase.from("alerts").select("*").order("rule")),
    readRows<AlertFrequency>(supabase.from("alert_frequencies").select("*")),
    readRows<PushSubscriptionRecord>(supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth, created_at")),
    readRows<UserSettings>(supabase.from("settings").select("user_id, telegram_chat_id, bale_chat_id, created_at, updated_at")),
  ]);
  const frequencyByKind = new Map((frequencies.ok ? frequencies.data : []).map((row) => [row.kind, row]));
  const deliveryNote = deliveryStatus(params.delivery);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const baleReady = Boolean(process.env.BALE_BOT_TOKEN?.trim());
  const baleChatId = settings.ok ? settings.data[0]?.bale_chat_id ?? null : null;

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
                        {alert.sent ? "اعلان ارسال شد" : "اعلان در انتظار"}
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
                این متن فقط روی کارت قاعده دیده می‌شود. زمان اعلان از تناوب نوع هشدار در بخش پایین پیروی می‌کند.
              </p>
              <SubmitButton>ثبت هشدار</SubmitButton>
            </form>
          </Panel>
        </div>
      )}
      <div className="mt-4">
        {frequencies.ok && subscriptions.ok && settings.ok ? (
          <Panel title="ارسال هشدار">
            <p className="mb-4 text-sm leading-7 text-muted-foreground">
              هشدار تازه به اعلان مرورگر و، اگر شناسه بله ذخیره شده باشد، به بازوی بله می‌رود.
              قبل از ارسال، تناوب همان نوع هشدار چک می‌شود. اگر یکی از مسیرهای فعال پیام را نپذیرد، هشدار ارسال‌نشده می‌ماند.
              روی آیفون ابتدا رهیار را به صفحهٔ اصلی اضافه کنید.
            </p>
            <EnablePushButton publicKey={vapidPublicKey} registered={subscriptions.data.length} />
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-medium">بازو بله</h3>
              <p className="mb-3 text-sm leading-7 text-muted-foreground">
                در بله با @botfather بازو بسازید و توکن را در BALE_BOT_TOKEN بگذارید. بعد در همان بازو یک پیام بفرستید و شناسه را بخوانید. عدد ابتدای توکن شناسهٔ گفتگو نیست.
                {baleChatId ? ` شناسه ذخیره‌شده: ${baleChatId}` : " هنوز شناسه‌ای ذخیره نشده است."}
              </p>
              {baleReady ? null : (
                <p className="mb-3 text-sm leading-7 text-muted-foreground">توکن بازو هنوز در سرور نیست. بعد از گذاشتن توکن، سرور توسعه را یک‌بار دوباره اجرا کنید.</p>
              )}
              <form action={linkBaleChat}>
                <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm">
                  خواندن شناسه از بله
                </button>
              </form>
              <form action={setBaleChatId} className="mt-3 grid gap-3">
                <Field label="شناسه گفتگو">
                  <input name="chat_id" required inputMode="numeric" dir="ltr" defaultValue={baleChatId ?? ""} className="field-input text-left" />
                </Field>
                <SubmitButton>ذخیره شناسه بله</SubmitButton>
              </form>
            </div>
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
            <form action={retryAlertDelivery} className="mt-4">
              <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm">
                ارسال هشدارهای معوق
              </button>
            </form>
          </Panel>
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
    </div>
  );
}
