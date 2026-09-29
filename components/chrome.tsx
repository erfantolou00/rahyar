import type { ReactNode } from "react";

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{description}</p> : null}
      </div>
      {action}
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
    <section className="overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-sm">
      {title ? <h2 className="mb-4 text-base font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Notice({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="mb-4 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
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
    <label className="grid gap-1.5 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium transition hover:opacity-90"
    >
      {children}
    </button>
  );
}

const errorMessages: Record<string, string> = {
  invalid: "اطلاعات واردشده کامل یا معتبر نیست.",
  save: "ذخیره انجام نشد. دوباره تلاش کنید.",
  prices: "قیمت‌ها به‌روز نشد. دوباره تلاش کنید.",
};

export function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return errorMessages[code] ?? null;
}
