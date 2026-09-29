import type { Metadata } from "next";
import { EmptyState, Field, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/chrome";
import { RefreshPricesButton } from "@/components/refresh-prices-button";
import { ensureLivePrices } from "@/lib/finance/prices/ensure";
import { createPrice } from "@/app/(dashboard)/prices/actions";
import { formatNumber, formatTimestamp, toNumber } from "@/lib/finance/format";
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr>
                      <th>زمان</th>
                      <th>نوع</th>
                      <th>نماد</th>
                      <th>قیمت</th>
                      <th>منبع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.data.map((row) => (
                      <tr key={row.id}>
                        <td>{formatTimestamp(row.timestamp)}</td>
                        <td>{assetTypeLabels[row.asset_type]}</td>
                        <td className="numeric">{row.symbol}</td>
                        <td className="numeric">{formatNumber(toNumber(row.price))}</td>
                        <td>{row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
