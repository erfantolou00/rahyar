import Link from "next/link";
import { AssetChart } from "@/components/dashboard/asset-chart";
import { Card } from "@/components/dashboard/card";
import { ChartContainer, InteractiveLineChart } from "@/components/dashboard/chart-container";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { AlertRow } from "@/components/dashboard/alert-row";
import { SideBadge } from "@/components/dashboard/side-badge";
import { toneClassName } from "@/lib/overview/tone";
import type { OverviewView } from "@/lib/overview/view";

function SampleBanner({ reason }: { reason: NonNullable<OverviewView["sampleReason"]> }) {
  const copy =
    reason === "preview"
      ? "این چیدمان با اعداد نمونه پر شده تا ظاهر نهایی دیده شود. انحراف تخصیص و ماکرو پایین صفحه از دفتر واقعی شماست."
      : "هنوز دارایی یا تراکنشی ثبت نشده. کارت‌ها با اعداد نمونه پر شده‌اند تا چیدمان نهایی دیده شود.";

  return (
    <p className="rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm leading-7">
      {copy}{" "}
      <Link href="/basket" className="underline underline-offset-4">
        رفتن به سبد
      </Link>
      {reason === "empty" ? null : (
        <>
          {" · "}
          <Link href="/" className="underline underline-offset-4">
            بازگشت به دفتر
          </Link>
        </>
      )}
    </p>
  );
}

export function OverviewDashboard({ view }: { view: OverviewView }) {
  return (
    <div className="grid gap-4">
      {view.sample && view.sampleReason ? <SampleBanner reason={view.sampleReason} /> : null}

      <section aria-label="خلاصه دارایی" className="grid gap-4 md:grid-cols-3">
        {view.kpis.map((kpi) => (
          <KpiTile
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            unit={kpi.unit}
            hint={kpi.hint}
            emphasis={kpi.emphasis}
            valueTone={kpi.valueTone}
            delta={kpi.delta}
          />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <ChartContainer className="min-w-0 lg:col-span-2" title="ترکیب دارایی" description="سهم هر طبقه از ارزش فعلی سبد.">
          <AssetChart slices={view.slices} />
        </ChartContainer>
        <ChartContainer
          className="min-w-0 lg:col-span-3"
          title="عملکرد سبد"
          description={view.seriesCaption}
          action={
            view.seriesDelta ? (
              <span className={`numeric text-sm ${toneClassName[view.seriesDelta.tone]}`}>{view.seriesDelta.text}</span>
            ) : (
              <span className="text-xs text-muted-foreground">یک ماه</span>
            )
          }
        >
          <InteractiveLineChart
            points={view.series.map((point) => ({ label: point.label, value: point.value }))}
            unit="ریال"
          />
        </ChartContainer>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card
          title="هشدارهای فعال"
          description="قاعده‌های قیمتی و شرطی که روشن هستند."
          action={
            <Link href="/alerts" className="text-xs text-muted-foreground underline underline-offset-4">
              همه
            </Link>
          }
        >
          {view.alerts.length === 0 ? (
            <p className="text-sm leading-7 text-muted-foreground">{view.alertsNote}</p>
          ) : (
            <ul className="grid gap-3">
              {view.alerts.map((alert) => (
                <AlertRow key={alert.id} title={alert.title} meta={alert.meta} />
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="آخرین معاملات"
          description="پنج تراکنش اخیر دفتر."
          action={
            <Link href="/transactions" className="text-xs text-muted-foreground underline underline-offset-4">
              همه
            </Link>
          }
        >
          {view.trades.length === 0 ? (
            <p className="text-sm leading-7 text-muted-foreground">{view.tradesNote}</p>
          ) : (
            <ul className="grid gap-2">
              {view.trades.map((trade) => (
                <li key={trade.id} className="flex items-center justify-between gap-3 rounded-xl px-1 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <SideBadge side={trade.side} label={trade.sideLabel} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{trade.title}</span>
                      {trade.note ? <span className="block truncate text-xs text-muted-foreground">{trade.note}</span> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="numeric block text-sm">{trade.qty}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{trade.when}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
