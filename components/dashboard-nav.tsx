"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function DashboardNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <div>
          <p className="text-xs text-muted-foreground">دستیار مالی شخصی</p>
          <p className="text-lg font-semibold">رهیار</p>
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
      <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
                active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent-soft"
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
