import type { Metadata } from "next";
import { BasketBoard } from "@/components/basket/basket-board";
import { Notice, PageHeader, SchemaNotice, errorMessage } from "@/components/chrome";
import { presentBasket, presentMarks } from "@/lib/finance/basket-view";
import { ensureLivePrices } from "@/lib/finance/prices/ensure";
import { loadBasket, loadLivePrices } from "@/lib/finance/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "سبد دارایی" };

export default async function BasketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  await ensureLivePrices(supabase);
  const [basket, livePrices] = await Promise.all([loadBasket(supabase), loadLivePrices(supabase)]);

  if (!basket.ok) return <SchemaNotice missing={basket.missingSchema} />;

  const view = presentBasket(basket.data);
  const marks = presentMarks(livePrices);

  return (
    <div>
      <PageHeader
        title="سبد دارایی"
        description="دلار، طلای ۱۸ عیار و بیت‌کوین از قیمت زنده به ریال حساب می‌شوند. نام این دارایی‌ها را دلار، طلا یا بیت‌کوین بگذارید. بقیهٔ دارایی‌ها با قیمت دستی می‌مانند."
      />
      <Notice message={errorMessage(params.error)} />
      <BasketBoard
        marks={marks}
        rows={view.rows}
        totalValue={view.totalValue}
        totalAbsolute={view.totalAbsolute}
        totalPercent={view.totalPercent}
        totalTone={view.totalTone}
      />
    </div>
  );
}
