"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/login/actions";

const initialState: SignInState = null;

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span>ایمیل</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          dir="ltr"
          className="field-input text-left"
        />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span>رمز عبور</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          dir="ltr"
          className="field-input text-left"
        />
      </label>
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "در حال ورود..." : "ورود"}
      </button>
    </form>
  );
}
