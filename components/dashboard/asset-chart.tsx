import type { OverviewSliceView } from "@/lib/overview/view";

export function AssetChart({ slices }: { slices: OverviewSliceView[] }) {
  if (slices.length === 0) {
    return <p className="text-sm leading-7 text-muted-foreground">هنوز طبقه‌ای با ارزش ثبت نشده است.</p>;
  }

  const total = slices.reduce((sum, slice) => sum + slice.weight, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const gap = slices.length > 1 ? 2.5 : 0;
  const lengths = slices.map((slice) => Math.max(0, (slice.weight / total) * circumference - gap));
  const lead = slices[0];

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="0 0 120 120" className="size-40 shrink-0" aria-hidden>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--muted)" strokeWidth="12" />
        {slices.map((slice, index) => {
          const length = lengths[index] ?? 0;
          const dashOffset = -lengths.slice(0, index).reduce((sum, part) => sum + part + gap, 0);
          return (
            <circle
              key={slice.id}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth="12"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 60 60)"
            />
          );
        })}
        {lead ? (
          <>
            <text
              x="60"
              y="58"
              textAnchor="middle"
              fill="var(--foreground)"
              fontSize="13"
              fontFamily="Vazirmatn, sans-serif"
            >
              {lead.weightLabel}
            </text>
            <text
              x="60"
              y="74"
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize="8"
              fontFamily="Vazirmatn, sans-serif"
            >
              {lead.label}
            </text>
          </>
        ) : null}
      </svg>
      <ul className="grid w-full gap-2.5">
        {slices.map((slice) => (
          <li key={slice.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: slice.color }} />
              <span className="truncate">{slice.label}</span>
            </span>
            <span className="shrink-0 text-end">
              <span className="numeric text-foreground">{slice.weightLabel}</span>
              <span className="numeric mt-0.5 block text-xs text-muted-foreground">{slice.valueLabel}</span>
              {slice.status ? (
                <span className={slice.statusTone === "ok" ? "mt-0.5 block text-xs text-ok" : "mt-0.5 block text-xs text-warn"}>
                  {slice.status}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
