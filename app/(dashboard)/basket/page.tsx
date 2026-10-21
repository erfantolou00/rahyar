import type { Metadata } from "next";
import { BasketBoard } from "@/components/basket/basket-board";
import { Notice, PageHeader, SchemaNotice, errorMessage } from "@/components/chrome";
import { RefreshPricesButton } from "@/components/refresh-prices-button";
import { presentBasket, presentFundamentals, presentMarks } from "@/lib/finance/basket-view";
import { loadBasket, loadLedger, loadLivePrices, loadStockFundamentals } from "@/lib/finance/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "سبد دارایی" };

export default async function BasketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [basket, livePrices, fundamentals, ledger] = await Promise.all([
    loadBasket(supabase),
    loadLivePrices(supabase),
    loadStockFundamentals(supabase),
    loadLedger(supabase),
  ]);

  if (!basket.ok) return <SchemaNotice missing={basket.missingSchema} />;

  const view = presentBasket(basket.data);
  const marks = presentMarks(livePrices);
  const stockSymbols = [
    ...new Set(view.rows.filter((row) => row.values.type === "stock").map((row) => row.values.symbol.trim()).filter(Boolean)),
  ];

  return (
    <div>
      <PageHeader
        title="سبد دارایی"
        description="ارزش‌ها از قیمت ذخیره‌شده حساب می‌شوند. سهام شنبه تا چهارشنبه ساعت ۹ تا ۱۳ روی سرور قیمت می‌گیرد. شاخص کدال و گزارش بازار هم همان‌جا ذخیره شده‌اند و با باز کردن این صفحه از بیرون خوانده نمی‌شوند."
        action={<RefreshPricesButton returnTo="/basket" />}
      />
      <Notice message={errorMessage(params.error)} />
      <BasketBoard
        marks={marks}
        rows={view.rows}
        totalValue={view.totalValue}
        totalAbsolute={view.totalAbsolute}
        totalPercent={view.totalPercent}
        totalTone={view.totalTone}
        fundamentals={fundamentals.ok ? presentFundamentals(stockSymbols, fundamentals.data) : []}
        fundamentalsSchema={fundamentals.ok ? null : fundamentals.missingSchema}
        ledgerReady={ledger.ready}
        accounts={ledger.accounts}
        positions={ledger.positions}
      />
    </div>
  );
}
