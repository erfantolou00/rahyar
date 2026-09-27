import type { Metadata } from "next";
import { EmptyState, Field, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/ui";
import { createAsset } from "@/app/(dashboard)/assets/actions";
import { formatNumber, toNumber } from "@/lib/finance/format";
import { assetTypeLabels, riskLabels } from "@/lib/finance/labels";
import { assetTypes, type Asset } from "@/lib/finance/types";
import { readRows } from "@/lib/finance/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "دارایی‌ها" };

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const assets = await readRows<Asset>(
    supabase.from("assets").select("*").order("created_at", { ascending: false }),
  );

  return (
    <div>
      <PageHeader
        title="دارایی‌ها"
        description="هر ردیف فقط برای صاحب همین حساب دیده می‌شود."
      />
      <Notice message={errorMessage(params.error)} />
      {!assets.ok ? (
        <SchemaNotice missing={assets.missingSchema} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel title="دفتر دارایی">
            {assets.data.length === 0 ? (
              <EmptyState>هنوز دارایی ثبت نشده است.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr>
                      <th>نماد</th>
                      <th>نوع</th>
                      <th>مقدار</th>
                      <th>میانگین خرید</th>
                      <th>ریسک</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.data.map((asset) => (
                      <tr key={asset.id}>
                        <td className="numeric">{asset.symbol}</td>
                        <td>{assetTypeLabels[asset.type]}</td>
                        <td className="numeric">{formatNumber(toNumber(asset.quantity))}</td>
                        <td className="numeric">
                          {asset.avg_buy_price == null
                            ? "—"
                            : formatNumber(toNumber(asset.avg_buy_price))}
                        </td>
                        <td>{asset.risk_level ? riskLabels[asset.risk_level] : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="دارایی جدید">
            <form action={createAsset} className="grid gap-3">
              <Field label="نوع">
                <select name="type" required className="field-input">
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
              <Field label="مقدار">
                <input name="quantity" required inputMode="decimal" defaultValue="0" dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="میانگین خرید">
                <input name="avg_buy_price" inputMode="decimal" dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="حداقل وزن هدف (درصد)">
                <input name="target_min_weight" inputMode="decimal" dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="حداکثر وزن هدف (درصد)">
                <input name="target_max_weight" inputMode="decimal" dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="سطح ریسک">
                <select name="risk_level" className="field-input" defaultValue="">
                  <option value="">نامشخص</option>
                  {Object.entries(riskLabels).map(([level, label]) => (
                    <option key={level} value={level}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <SubmitButton>ثبت دارایی</SubmitButton>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
