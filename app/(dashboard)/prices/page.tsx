import type { Metadata } from "next";
import { Field, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/chrome";
import { MacroPanel } from "@/components/macro-panel";
import { PriceFeedsDialog } from "@/components/price-feeds-dialog";
import { PricesBrowser } from "@/components/prices-browser";
import { RefreshPricesButton } from "@/components/refresh-prices-button";
import { createPrice } from "@/app/(dashboard)/prices/actions";
import { formatDollar, formatNumber, formatTimestamp, toNumber } from "@/lib/finance/format";
import { presentMacro } from "@/lib/finance/macro/present";
import { btcInUsdt } from "@/lib/finance/prices/btc";
import { loadPricePage, parsePriceListQuery } from "@/lib/finance/prices/list";
import { readRows } from "@/lib/finance/queries";
import { assetTypeLabels } from "@/lib/finance/labels";
import { assetTypes, type MacroIndicatorRow } from "@/lib/finance/types";
import { loadPriceFeeds } from "@/lib/finance/prices/feed-store";
import { requireSession } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "قیمت‌ها" };

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { supabase, userId } = await requireSession();
  const query = parsePriceListQuery(params.q, params.page);
  const [prices, macroRows, feeds] = await Promise.all([
    loadPricePage(supabase, query),
    readRows<Pick<MacroIndicatorRow, "indicator" | "value" | "date" | "source">>(
      supabase.from("macro_indicators").select("indicator,value,date,source").order("date", { ascending: false }),
    ),
    loadPriceFeeds(supabase, userId),
  ]);
  const macro = macroRows.ok ? presentMacro(macroRows.data) : null;

  return (
    <div>
      <PageHeader
        title="قیمت‌ها"
        description="هر قیمت متعلق به همین حساب است. آخرین قیمت ذخیره‌شده در ارزش دفتر استفاده می‌شود. دلار، طلا، سکه‌های امامی و بهار آزادی و نیم و ربع، و بیت‌کوین از بازار خوانده می‌شوند. سهام شنبه تا چهارشنبه ساعت ۹ تا ۱۳ روی سرور ثبت می‌شود و این صفحه منتظر قیمت جدید نمی‌ماند."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PriceFeedsDialog feeds={feeds.feeds} schemaMissing={feeds.missingSchema} />
            <RefreshPricesButton returnTo="/prices" />
          </div>
        }
      />
      <Notice message={errorMessage(params.error)} />
      <div className="mb-4">
        <MacroPanel
          cards={macro?.cards ?? []}
          empty={macro?.empty ?? false}
          schemaIssue={macroRows.ok ? null : macroRows.missingSchema}
        />
      </div>
      {!prices.ok ? (
        <SchemaNotice missing={prices.missingSchema} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel title="آخرین ثبت‌ها">
            <PricesBrowser
              needle={query.needle}
              page={prices.page}
              pageCount={prices.pageCount}
              total={prices.total}
              rows={prices.rows.map((row) => {
                const raw = toNumber(row.price);
                const shown = shownPrice(row.symbol, raw, prices.usd);
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
                <input name="symbol" required maxLength={32} dir="ltr" className="field-input text-start" />
              </Field>
              <Field label="قیمت">
                <input name="price" required inputMode="decimal" dir="ltr" className="field-input text-start" />
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

function shownPrice(symbol: string, raw: number, usdRial: number | null): number | null {
  if (symbol !== "BTC") return raw;
  return btcInUsdt(raw, usdRial);
}
