import type { ReactNode } from "react";

export const primaryControlClass =
  "inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none";

export const quietControlClass =
  "inline-flex h-11 items-center justify-center rounded-lg border border-line bg-card px-4 text-sm font-medium text-foreground transition-colors duration-150 outline-none hover:bg-accent-soft focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none";

export const dangerControlClass =
  "inline-flex h-11 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors duration-150 outline-none hover:bg-destructive/20 focus-visible:ring-3 focus-visible:ring-destructive/30 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="surface overflow-hidden p-4">
      {title ? <h2 className="mb-4 border-b border-line pb-3 text-base font-semibold text-foreground">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Notice({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-7 text-muted-foreground">{children}</p>;
}

export function SchemaNotice({ missing }: { missing: boolean }) {
  return (
    <Panel>
      <p className="text-sm leading-7">
        {missing
          ? "جدول‌ها هنوز در پایگاه داده نیستند. migration را روی Supabase اجرا کنید و صفحه را دوباره باز کنید."
          : "خواندن داده‌ها ممکن نشد. اتصال Supabase و سیاست‌های دسترسی را بررسی کنید."}
      </p>
    </Panel>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className={primaryControlClass}>
      {children}
    </button>
  );
}

const errorMessages: Record<string, string> = {
  invalid: "اطلاعات واردشده کامل یا معتبر نیست.",
  unit: "این سهم یا صندوق از قبل با مبنای قیمت دیگری ثبت شده است.",
  oversell: "تعداد از ماندهٔ همین حساب بیشتر است.",
  open: "این دارایی هنوز مانده دارد. اول فروش یا برداشت را ثبت کنید.",
  cash: "نقد همین حساب برای این معامله کافی نیست، یا دارایی نقد این ارز بیش از یکی است.",
  currency: "ارز حساب با مبنای قیمت دارایی یکی نیست.",
  ledger: "این عمل برای این نوع دارایی در دفتر معاملات مجاز نیست.",
  account: "حساب معاملات پیدا نشد.",
  history: "سابقه این دارایی در دفتر مانده است و حذف نمی‌شود.",
  save: "ذخیره انجام نشد. دوباره تلاش کنید.",
  symbol: "این سهم در سبد مانده ندارد.",
  prices: "قیمت‌ها به‌روز نشد. دوباره تلاش کنید.",
  push_missing: "ابتدا اعلان مرورگر را فعال کنید یا شناسه گفتگوی بله را ذخیره کنید.",
  bale_token: "توکن بازوی بله در سرور تنظیم نشده است.",
  bale_chat: "شناسه گفتگو پیدا نشد. در بله به بازو پیام بدهید و دوباره تلاش کنید.",
  bale_invalid: "شناسه گفتگوی بله باید یک عدد باشد.",
  bale_self: "این عدد شناسهٔ خود بازو است، نه گفتگوی شما. در بله به بازو پیام بدهید و «خواندن شناسه از بله» را بزنید.",
  push: "ارسال اعلان انجام نشد. هشدارهای ناموفق برای تلاش بعدی مانده‌اند.",
};

export function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return errorMessages[code] ?? null;
}
