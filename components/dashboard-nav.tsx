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

function linkActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-line/80 bg-card/80 backdrop-blur-md">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
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
              className="inline-flex h-11 items-center rounded-full border border-line bg-card px-4 text-sm text-foreground transition-colors duration-150 outline-none hover:bg-accent-soft focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
            >
              خروج
            </button>
          </form>
        </div>
      </div>
      <nav className="flex w-full gap-2 overflow-x-auto px-4 pb-3 sm:px-6 lg:flex-wrap lg:px-8">
        {links.map((link) => {
          const active = linkActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none ${
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
