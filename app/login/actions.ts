"use server";

import { redirect } from "next/navigation";
import {
  emailFromClaims,
  hasAllowlist,
  hasSupabaseEnv,
  isAllowedEmail,
} from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string } | null;

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  if (!hasSupabaseEnv() || !hasAllowlist()) {
    return { error: "ورود هنوز پیکربندی نشده است." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) {
    return { error: "ایمیل و رمز عبور را وارد کنید." };
  }

  if (!isAllowedEmail(email)) {
    return { error: "ایمیل یا رمز عبور نادرست است." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "ایمیل یا رمز عبور نادرست است." };
  }

  const { data } = await supabase.auth.getClaims();
  if (!isAllowedEmail(emailFromClaims(data?.claims))) {
    await supabase.auth.signOut();
    return { error: "ایمیل یا رمز عبور نادرست است." };
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    redirect("/login/mfa");
  }

  redirect("/");
}

export async function signOut() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
