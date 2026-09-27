import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { redirect } from "next/navigation";
import { emailFromClaims, hasAllowlist, hasSupabaseEnv, isAllowedEmail } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ورود" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (hasSupabaseEnv() && hasAllowlist()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const email = emailFromClaims(data?.claims);
    if (data?.claims && isAllowedEmail(email)) {
      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const needsMfa = assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2";
      redirect(needsMfa ? "/login/mfa" : "/");
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16">
      <p className="text-sm text-muted">دستیار مالی شخصی</p>
      <h1 className="mt-1 text-3xl font-semibold">ورود به رهیار</h1>
      <p className="mt-3 text-sm leading-7 text-muted">
        این دفتر فقط برای یک حساب است. ثبت‌نام عمومی وجود ندارد.
      </p>
      {!hasSupabaseEnv() || !hasAllowlist() ? (
        <p className="mt-6 rounded-2xl border border-line bg-card p-4 text-sm leading-7">
          متغیرهای محیطی هنوز کامل نیستند. فایل <span className="numeric">.env.example</span> را به{" "}
          <span className="numeric">.env.local</span> کپی کنید و نشانی پروژه، کلید عمومی و ایمیل مجاز را
          بگذارید.
        </p>
      ) : (
        <div className="mt-6 rounded-2xl border border-line bg-card p-5 shadow-sm">
          <LoginForm />
        </div>
      )}
    </main>
  );
}
