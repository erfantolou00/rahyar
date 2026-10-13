"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/login/actions";
import { primaryControlClass } from "@/components/chrome";

const initialState: SignInState = null;

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-sm">
        <span>ایمیل</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          dir="ltr"
          className="field-input text-start"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span>رمز عبور</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          dir="ltr"
          className="field-input text-start"
        />
      </label>
      {state?.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className={primaryControlClass}
      >
        {pending ? "در حال ورود..." : "ورود"}
      </button>
    </form>
  );
}
