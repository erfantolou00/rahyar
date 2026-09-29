import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel, SchemaNotice } from "@/components/chrome";
import { RefreshPricesButton } from "@/components/refresh-prices-button";
import { formatNumber, formatPercent, toNumber } from "@/lib/finance/format";
import { ensureLivePrices } from "@/lib/finance/prices/ensure";
import { allocationStatusLabels, assetTypeLabels, transactionTypeLabels } from "@/lib/finance/labels";
import { loadPortfolio, readRows } from "@/lib/finance/queries";
import type { Alert, Transaction } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "نمای کلی" };

export default async function OverviewPage() {
  const supabase = await createClient();
  await ensureLivePrices(supabase);
  const [portfolio, transactions, alerts] = await Promise.all([
    loadPortfolio(supabase),
    readRows<Transaction>(
      supabase.from("transactions").select("*").order("date", { ascending: false }).limit(5),
    ),
    readRows<Alert>(supabase.from("alerts").select("*").eq("is_active", true)),
  ]);

  if (!portfolio.ok) return <SchemaNotice missing={portfolio.missingSchema} />;

  return (
    <div>
      <PageHeader
        title="نمای کلی"
        description="ارزش دفتر از آخرین قیمت ثبت‌شده حساب می‌شود. اگر قیمت‌ها کهنه باشند، با باز کردن صفحه تازه می‌شوند."
        action={<RefreshPricesButton returnTo="/" />}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="ارزش کل">
          <p className="numeric text-3xl font-semibold">{formatNumber(portfolio.data.totalValue, 0)}</p>
        </Panel>
        <Panel title="دارایی‌ها">
          <p className="numeric text-3xl font-semibold">{formatNumber(portfolio.data.holdings.length, 0)}</p>
        </Panel>
        <Panel title="هشدار فعال">
          <p className="numeric text-3xl font-semibold">
            {alerts.ok ? formatNumber(alerts.data.length, 0) : "—"}
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="وزن انواع دارایی">
          {portfolio.data.byType.length === 0 ? (
            <EmptyState>
              هنوز دارایی یا محدوده‌ای ثبت نشده. از{" "}
              <Link href="/basket" className="underline underline-offset-4">
                دارایی‌ها
              </Link>{" "}
              شروع کنید.
            </EmptyState>
          ) : (
            <ul className="grid gap-3">
              {portfolio.data.byType.map((row) => (
                <li key={row.type} className="flex items-center justify-between gap-3 text-sm">
                  <span>{assetTypeLabels[row.type]}</span>
                  <span className="text-muted-foreground">
                    <span className="numeric">{formatPercent(row.weight)}</span>
                    {" · "}
                    {allocationStatusLabels[row.status]}
                    {row.minPercent != null && row.maxPercent != null ? (
                      <span className="numeric">
                        {" "}
                        ({formatNumber(row.minPercent, 0)}–{formatNumber(row.maxPercent, 0)})
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="آخرین تراکنش‌ها">
          {!transactions.ok ? (
            <EmptyState>تراکنش‌ها خوانده نشد.</EmptyState>
          ) : transactions.data.length === 0 ? (
            <EmptyState>تراکنشی ثبت نشده است.</EmptyState>
          ) : (
            <ul className="grid gap-2 text-sm">
              {transactions.data.map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <span>{row.note || transactionTypeLabels[row.type]}</span>
                  <span className="numeric text-muted-foreground">{formatNumber(toNumber(row.qty))}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
