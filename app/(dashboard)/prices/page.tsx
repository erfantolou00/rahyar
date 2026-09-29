import type { Metadata } from "next";
import { EmptyState, Field, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/chrome";
import { RefreshPricesButton } from "@/components/refresh-prices-button";
import { ensureLivePrices } from "@/lib/finance/prices/ensure";
import { createPrice } from "@/app/(dashboard)/prices/actions";
import { PricesTable } from "@/components/prices-table";
import { formatDollar, formatNumber, formatTimestamp, toNumber } from "@/lib/finance/format";
import { btcInUsdt } from "@/lib/finance/prices/btc";
import { assetTypeLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
import { assetTypes, type Price } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "قیمت‌ها" };

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  await ensureLivePrices(supabase);
  const prices = await readRows<Price>(
    supabase.from("prices").select("*").order("timestamp", { ascending: false }).limit(100),
  );

  return (
    <div>
      <PageHeader
        title="قیمت‌ها"
        description="هر قیمت متعلق به همین حساب است. آخرین قیمت هر نماد در ارزش دفتر استفاده می‌شود. اگر قیمت‌ها کهنه باشند، با باز کردن صفحه تازه می‌شوند."
        action={<RefreshPricesButton returnTo="/prices" />}
      />
      <Notice message={errorMessage(params.error)} />
      {!prices.ok ? (
        <SchemaNotice missing={prices.missingSchema} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel title="آخرین ثبت‌ها">
            {prices.data.length === 0 ? (
              <EmptyState>قیمتی ثبت نشده است.</EmptyState>
            ) : (
              <PricesTable
                rows={prices.data.map((row) => {
                  const raw = toNumber(row.price);
                  const shown = shownPrice(row.symbol, raw, dollarRate(prices.data));
                  return {
                    id: row.id,
                    timeLabel: formatTimestamp(row.timestamp),
                    timeValue: new Date(row.timestamp).getTime(),
                    typeLabel: assetTypeLabels[row.asset_type],
                    symbol: row.symbol,
                    priceLabel: row.symbol === "BTC" && shown != null ? formatDollar(shown) : formatNumber(shown ?? raw),
                    priceValue: shown ?? raw,
                    source: row.source,
                  };
                })}
              />
            )}
          </Panel>
          <Panel title="قیمت جدید">
            <form action={createPrice} className="grid gap-3">
              <Field label="نوع">
                <select name="asset_type" required className="field-input">
                  {assetTypes.map((type) => (
                    <option key={type} value={type}>
                      {assetTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="نماد">
                <input name="symbol" required maxLength={32} dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="قیمت">
                <input name="price" required inputMode="decimal" dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="منبع">
                <input name="source" defaultValue="دستی" maxLength={80} className="field-input" />
              </Field>
              <SubmitButton>ثبت قیمت</SubmitButton>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}

function dollarRate(prices: Price[]): number | null {
  const usd = prices.find((row) => row.symbol === "USD");
  return usd ? toNumber(usd.price) : null;
}

function shownPrice(symbol: string, raw: number, usdRial: number | null): number | null {
  if (symbol !== "BTC") return raw;
  return btcInUsdt(raw, usdRial);
}
