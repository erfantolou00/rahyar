import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaChallengeForm } from "@/components/mfa-challenge-form";
import { emailFromClaims, hasSupabaseEnv, isAllowedEmail } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "تأیید دوم" };
export const dynamic = "force-dynamic";

export default async function MfaPage() {
  if (!hasSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims || !isAllowedEmail(emailFromClaims(data.claims))) {
    redirect("/login");
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!(assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2")) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16">
      <p className="text-sm text-muted-foreground">ورود دو مرحله‌ای</p>
      <h1 className="mt-1 text-3xl font-semibold">رمز یک‌بارمصرف</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        رمز شش‌رقمی برنامه احراز هویت را وارد کنید.
      </p>
      <div className="mt-6 rounded-2xl border border-line bg-card p-5 shadow-sm">
        <MfaChallengeForm />
      </div>
    </main>
  );
}
