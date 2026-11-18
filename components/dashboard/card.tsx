import type { ReactNode } from "react";
import { cn } from "cn";

export function Card({
  title,
  description,
  action,
  children,
  className,
  density = "regular",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  density?: "regular" | "compact";
}) {
  return (
    <section className={cn("surface-card", density === "compact" && "surface-card-compact", className)}>
      {title || action || description ? (
        <header className={cn("flex items-start justify-between gap-3", density === "compact" ? "mb-2" : "mb-4")}>
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}
