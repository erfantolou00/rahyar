import type { Metadata } from "next";
import { BasketBoard } from "@/components/basket/basket-board";
import { Notice, PageHeader, SchemaNotice, errorMessage } from "@/components/chrome";
import { presentBasket } from "@/lib/finance/basket-view";
import { loadBasket } from "@/lib/finance/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "سبد دارایی" };

export default async function BasketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const basket = await loadBasket(supabase);

  if (!basket.ok) return <SchemaNotice missing={basket.missingSchema} />;

  const view = presentBasket(basket.data);

  return (
    <div>
      <PageHeader
        title="سبد دارایی"
        description="قیمت‌ها برای هر واحد و به ریال هستند. ارزش فعلی از ضرب تعداد در قیمت فعلی به‌دست می‌آید."
      />
      <Notice message={errorMessage(params.error)} />
      <BasketBoard
        rows={view.rows}
        totalValue={view.totalValue}
        totalAbsolute={view.totalAbsolute}
        totalPercent={view.totalPercent}
        totalTone={view.totalTone}
      />
    </div>
  );
}
