"use client";

import type { ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/dashboard/card";
import { formatNumber } from "@/lib/finance/format";
import { colorVar } from "@/lib/theme";

export function ChartContainer({
  title,
  description,
  action,
  children,
  className,
  density = "regular",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  density?: "regular" | "compact";
}) {
  return (
    <Card title={title} description={description} action={action} className={className} density={density}>
      {children}
    </Card>
  );
}

export function InteractiveLineChart({
  points,
  unit,
}: {
  points: { label: string; value: number }[];
  unit?: string;
}) {
  if (points.length < 2) {
    return (
      <div className="grid h-40 place-items-center rounded-xl border border-dashed border-line px-4 text-center text-sm leading-7 text-muted-foreground">
        از شب دوم این خط رسم می‌شود.
      </div>
    );
  }

  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const stroke = last >= first ? colorVar.profit : colorVar.loss;

  return (
    <div dir="ltr">
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="label" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              content={(props) => {
                const raw = props.payload?.[0]?.value;
                const amount = typeof raw === "number" ? raw : null;
                if (!props.active || amount == null) return null;
                return (
                  <div className="rounded-lg border border-line bg-popover px-2 py-1 text-xs text-popover-foreground">
                    <p>{props.label}</p>
                    <p className="numeric mt-1">
                      {formatNumber(amount, 0)}
                      {unit ? ` ${unit}` : ""}
                    </p>
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
