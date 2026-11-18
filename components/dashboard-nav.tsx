"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/login/actions";

const links = [
  { href: "/", label: "نمای کلی" },
  { href: "/basket", label: "سبد دارایی" },
  { href: "/transactions", label: "تراکنش‌ها" },
  { href: "/prices", label: "قیمت‌ها" },
  { href: "/allocations", label: "تخصیص" },
  { href: "/alerts", label: "هشدارها" },
  { href: "/reports", label: "گزارش‌ها" },
  { href: "/chat", label: "گفتگو" },
  { href: "/security", label: "امنیت" },
];

export function DashboardFrame({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const chat = pathname === "/chat";

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <DashboardNav email={email} />
      <main
        className={
          chat
            ? "mx-auto flex w-full min-h-0 max-w-full flex-1 flex-col overflow-hidden"
            : "mx-auto w-full min-h-0 max-w-full flex-1 overflow-y-auto px-16 py-8"
        }
      >
        {children}
      </main>
    </div>
  );
}

export function DashboardNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-full items-center justify-between gap-4 px-16 py-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
          >
            R
          </span>
          <div>
            <p className="text-lg font-semibold leading-6">رهیار</p>
            <p className="text-xs text-muted-foreground">دستیار مالی شخصی</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block" dir="ltr">
            {email}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-accent-soft"
            >
              خروج
            </button>
          </form>
        </div>
      </div>
      <nav className="mx-auto flex max-w-full gap-1 overflow-x-auto px-24 pb-3">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
