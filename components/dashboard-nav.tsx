"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/login/actions";

const links = [
  { href: "/", label: "نمای کلی" },
  { href: "/basket", label: "سبد دارایی" },
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
            ? "flex w-full min-h-0 flex-1 flex-col overflow-hidden"
            : "w-full min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8"
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
    <header className="border-b border-line/80 bg-card/75 backdrop-blur-md">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-sm"
          >
            ر
          </span>
          <div>
            <p className="text-xs text-muted-foreground">دستیار مالی شخصی</p>
            <p className="text-lg font-semibold leading-6">رهیار</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block" dir="ltr">
            {email}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-foreground transition hover:bg-accent-soft"
            >
              خروج
            </button>
          </form>
        </div>
      </div>
      <nav className="flex w-full gap-1 overflow-x-auto px-4 pb-3 sm:px-6 lg:px-8">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent-soft hover:text-foreground"
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
