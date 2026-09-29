"use client";

import { InfoTip } from "@/components/info-tip";
import { describeSource } from "@/lib/finance/prices/source-label";

export function SourceName({ source }: { source: string }) {
  const label = describeSource(source);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{label.short}</span>
      <InfoTip text={label.full} />
    </span>
  );
}
