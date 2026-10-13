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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
          ر
        </span>
        <div>
          <p className="text-xs text-muted-foreground">دستیار مالی شخصی</p>
          <p className="text-lg font-semibold leading-6">رهیار</p>
        </div>
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">ورود به رهیار</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        این دفتر فقط برای یک حساب است. ثبت‌نام عمومی وجود ندارد.
      </p>
      {!hasSupabaseEnv() || !hasAllowlist() ? (
        <p className="surface mt-6 p-4 text-sm leading-6">
          متغیرهای محیطی هنوز کامل نیستند. فایل <span className="numeric">.env.example</span> را به{" "}
          <span className="numeric">.env.local</span> کپی کنید و نشانی پروژه، کلید عمومی و ایمیل مجاز را
          بگذارید.
        </p>
      ) : (
        <div className="surface mt-6 p-4">
          <LoginForm />
        </div>
      )}
    </main>
  );
}
