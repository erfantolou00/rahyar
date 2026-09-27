import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">{description}</p> : null}
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
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
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
  return <p className="text-sm leading-7 text-muted">{children}</p>;
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
      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
    >
      {children}
    </button>
  );
}

const errorMessages: Record<string, string> = {
  invalid: "اطلاعات واردشده کامل یا معتبر نیست.",
  save: "ذخیره انجام نشد. دوباره تلاش کنید.",
};

export function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return errorMessages[code] ?? null;
}
