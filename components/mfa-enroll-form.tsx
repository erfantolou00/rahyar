"use client";

import { useActionState } from "react";
import { enrollMfa, verifyEnrollment, type EnrollState } from "@/app/(dashboard)/security/actions";

const initialState: EnrollState = null;

export function MfaEnrollForm() {
  const [state, enrollAction, enrolling] = useActionState(enrollMfa, initialState);
  const [verifyState, verifyAction, verifying] = useActionState(verifyEnrollment, initialState);
  const factorId = state?.factorId;
  const qrSource = state?.qr;
  const qr = qrSource
    ? qrSource.startsWith("<svg")
      ? `data:image/svg+xml;utf-8,${encodeURIComponent(qrSource)}`
      : qrSource
    : null;

  return (
    <div className="grid gap-4">
      <form action={enrollAction}>
        <button
          type="submit"
          disabled={enrolling}
          className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {enrolling ? "در حال ساخت..." : "فعال‌سازی رمز یک‌بارمصرف"}
        </button>
      </form>
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {qr && factorId ? (
        <form action={verifyAction} className="grid gap-3">
          <input type="hidden" name="factorId" value={factorId} />
          {/* Data-URI QR from Supabase Auth; next/image does not accept this source. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="کد QR برنامه احراز هویت" className="h-40 w-40 rounded-xl bg-white p-2" />
          {state?.secret ? (
            <p className="numeric text-sm text-muted-foreground" dir="ltr">
              {state.secret}
            </p>
          ) : null}
          <label className="grid gap-1.5 text-sm">
            <span>رمز شش‌رقمی</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              dir="ltr"
              className="field-input text-center tracking-[0.4em]"
            />
          </label>
          {verifyState?.error ? <p className="text-sm text-danger">{verifyState.error}</p> : null}
          <button
            type="submit"
            disabled={verifying}
            className="rounded-xl border border-line px-4 py-2.5 text-sm disabled:opacity-60"
          >
            {verifying ? "در حال تأیید..." : "تأیید و فعال‌سازی"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
