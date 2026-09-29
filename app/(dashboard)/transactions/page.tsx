import type { Metadata } from "next";
import { EmptyState, Field, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/chrome";
import { createTransaction } from "@/app/(dashboard)/transactions/actions";
import { TransactionsTable } from "@/components/transactions-table";
import { formatDay, formatNumber, toNumber } from "@/lib/finance/format";
import { transactionTypeLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
import { transactionTypes, type Asset, type Transaction } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "تراکنش‌ها" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [transactions, assets] = await Promise.all([
    readRows<Transaction>(supabase.from("transactions").select("*").order("date", { ascending: false })),
    readRows<Asset>(supabase.from("assets").select("*").order("symbol", { ascending: true })),
  ]);

  if (!transactions.ok) return <SchemaNotice missing={transactions.missingSchema} />;
  if (!assets.ok) return <SchemaNotice missing={assets.missingSchema} />;

  const symbols = new Map(assets.data.map((asset) => [asset.id, asset.symbol]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title="تراکنش‌ها" description="خرید، فروش، واریز و برداشت روی دارایی‌های خودتان." />
      <Notice message={errorMessage(params.error)} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="سابقه">
          {transactions.data.length === 0 ? (
            <EmptyState>تراکنشی ثبت نشده است.</EmptyState>
          ) : (
            <TransactionsTable
              rows={transactions.data.map((row) => ({
                id: row.id,
                dateLabel: formatDay(row.date),
                dateValue: row.date,
                asset: symbols.get(row.asset_id) ?? "—",
                typeLabel: transactionTypeLabels[row.type],
                qtyLabel: formatNumber(toNumber(row.qty)),
                qtyValue: toNumber(row.qty),
                priceLabel: formatNumber(toNumber(row.price)),
                priceValue: toNumber(row.price),
                note: row.note || "—",
              }))}
            />
          )}
        </Panel>
        <Panel title="تراکنش جدید">
          {assets.data.length === 0 ? (
            <EmptyState>اول یک دارایی ثبت کنید.</EmptyState>
          ) : (
            <form action={createTransaction} className="grid gap-3">
              <Field label="دارایی">
                <select name="asset_id" required className="field-input">
                  {assets.data.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.symbol}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="نوع">
                <select name="type" required className="field-input">
                  {transactionTypes.map((type) => (
                    <option key={type} value={type}>
                      {transactionTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="مقدار">
                <input name="qty" required inputMode="decimal" dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="قیمت">
                <input name="price" required inputMode="decimal" dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="تاریخ">
                <input name="date" type="date" required defaultValue={today} dir="ltr" className="field-input text-left" />
              </Field>
              <Field label="یادداشت">
                <textarea name="note" maxLength={500} rows={3} className="field-input" />
              </Field>
              <SubmitButton>ثبت تراکنش</SubmitButton>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
