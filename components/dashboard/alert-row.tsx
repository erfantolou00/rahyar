import type { ReactNode } from "react";
import { cn } from "cn";

export function AlertRow({
  title,
  meta,
  active = true,
  action,
}: {
  title: string;
  meta: string;
  active?: boolean;
  action?: ReactNode;
}) {
  return (
    <li className={cn("flex items-start justify-between gap-3", active ? "" : "opacity-60")}>
      <span className="flex min-w-0 items-start gap-3">
        <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", active ? "bg-warn" : "bg-muted-foreground")} />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className="mt-1 block text-xs leading-6 text-muted-foreground">{meta}</span>
        </span>
      </span>
      {action}
    </li>
  );
}
