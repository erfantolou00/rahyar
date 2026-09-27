"use client";

import { useActionState } from "react";
import { verifyMfa, type MfaState } from "@/app/login/mfa/actions";

const initialState: MfaState = null;

export function MfaChallengeForm() {
  const [state, action, pending] = useActionState(verifyMfa, initialState);

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span>رمز یک‌بارمصرف</span>
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
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "در حال بررسی..." : "تأیید"}
      </button>
    </form>
  );
}
