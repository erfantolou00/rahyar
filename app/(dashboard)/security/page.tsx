import type { Metadata } from "next";
import { Notice, PageHeader, Panel, errorMessage } from "@/components/chrome";
import { MfaEnrollForm } from "@/components/mfa-enroll-form";
import { unenrollMfa } from "@/app/(dashboard)/security/actions";
import { requireSession } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "امنیت" };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; enrolled?: string }>;
}) {
  const params = await searchParams;
  const { supabase, email } = await requireSession();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.filter((factor) => factor.status === "verified") ?? [];

  return (
    <div>
      <PageHeader
        title="امنیت"
        description="ورود با ایمیل و رمز عبور است. تأیید دوم با برنامهٔ رمز یک‌بارمصرف اختیاری است و هر وقت بخواهید همین‌جا روشن می‌شود."
      />
      <Notice message={errorMessage(params.error)} />
      {params.enrolled ? (
        <p className="mb-4 rounded-xl border border-ok/20 bg-ok/5 px-3 py-2 text-sm text-ok">
          تأیید دوم فعال شد. از ورود بعدی، رمز یک‌بارمصرف هم لازم است.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="حساب">
          <p className="text-sm leading-7">
            فقط این ایمیل اجازهٔ ورود دارد:
            <span className="numeric mt-2 block" dir="ltr">
              {email}
            </span>
          </p>
        </Panel>
        <Panel title="تأیید دوم">
          {verified.length === 0 ? (
            <MfaEnrollForm />
          ) : (
            <ul className="grid gap-3">
              {verified.map((factor) => (
                <li key={factor.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{factor.friendly_name || "رمز یک‌بارمصرف"}</span>
                  <form action={unenrollMfa}>
                    <input type="hidden" name="factorId" value={factor.id} />
                    <button type="submit" className="rounded-lg border border-line px-2 py-1 text-xs">
                      غیرفعال‌سازی
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
