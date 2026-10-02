"use client";

import { useState } from "react";

function keyBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function EnablePushButton({ publicKey, registered }: { publicKey: string; registered: number }) {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function enable() {
    if (!publicKey) {
      setStatus("کلید اعلان روی سرور تنظیم نشده است.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("این مرورگر اعلان را پشتیبانی نمی‌کند.");
      return;
    }

    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("اجازهٔ اعلان داده نشد.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const ready = await navigator.serviceWorker.ready;
      const active = ready.active ? ready : registration;
      const subscription = await active.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription),
      });
      setStatus(response.ok ? "اعلان این مرورگر فعال شد." : "ثبت اعلان انجام نشد.");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "";
      if (/push service not available/i.test(message)) {
        setStatus("این مرورگر سرویس اعلان ندارد. همان صفحه را در کروم یا اج باز کنید.");
      } else {
        setStatus("فعال‌سازی اعلان انجام نشد. صفحه را تازه کنید و دوباره تلاش کنید.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={enable}
        disabled={pending}
        className="w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "در حال فعال‌سازی" : "فعال کردن اعلان مرورگر"}
      </button>
      <p className="text-sm text-muted-foreground">
        {registered > 0
          ? `${registered.toLocaleString("fa-IR")} مرورگر برای دریافت اعلان ثبت شده است.`
          : "هنوز مرورگری برای اعلان ثبت نشده است."}
      </p>
      {status ? <p className="text-sm">{status}</p> : null}
    </div>
  );
}
