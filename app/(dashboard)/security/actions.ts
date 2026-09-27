"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readString } from "@/lib/finance/parse";
import { requireSession } from "@/lib/supabase/auth";

export type EnrollState = {
  error?: string;
  factorId?: string;
  qr?: string;
  secret?: string;
} | null;

export async function enrollMfa(previous: EnrollState): Promise<EnrollState> {
  if (previous?.factorId && previous.qr) return previous;
  const { supabase } = await requireSession();
  const { data: existing, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: "خواندن وضعیت تأیید دوم ممکن نشد." };
  if (existing.totp.some((factor) => factor.status === "verified")) {
    return { error: "یک عامل فعال از قبل وجود دارد." };
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "rahyar",
  });
  if (error || !data?.totp) return { error: "ساخت رمز یک‌بارمصرف ممکن نشد." };

  return {
    factorId: data.id,
    qr: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export async function verifyEnrollment(
  _previous: EnrollState,
  formData: FormData,
): Promise<EnrollState> {
  const { supabase } = await requireSession();
  const factorId = readString(formData, "factorId");
  const code = readString(formData, "code");
  if (!factorId || !/^\d{6}$/.test(code)) {
    return { error: "رمز باید شش رقم باشد.", factorId };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "رمز درست نیست.", factorId };

  revalidatePath("/security");
  redirect("/security?enrolled=1");
}

export async function unenrollMfa(formData: FormData) {
  const { supabase } = await requireSession();
  const factorId = readString(formData, "factorId");
  if (!factorId) redirect("/security?error=invalid");

  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    console.error(error);
    redirect("/security?error=save");
  }

  revalidatePath("/security");
  redirect("/security");
}
