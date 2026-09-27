"use server";

import { redirect } from "next/navigation";
import { emailFromClaims, isAllowedEmail } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type MfaState = { error: string } | null;

export async function verifyMfa(_previous: MfaState, formData: FormData): Promise<MfaState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { error: "رمز باید شش رقم باشد." };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!isAllowedEmail(emailFromClaims(claimsData?.claims))) {
    redirect("/login");
  }

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((item) => item.status === "verified");
  if (factorsError || !factor) {
    return { error: "عامل تأیید دوم پیدا نشد." };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  });
  if (error) {
    return { error: "رمز درست نیست یا منقضی شده است." };
  }

  redirect("/");
}
