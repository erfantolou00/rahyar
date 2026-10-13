import type { Metadata } from "next";
import { BasketBoard } from "@/components/basket/basket-board";
import { Notice, PageHeader, SchemaNotice, errorMessage } from "@/components/chrome";
import { RefreshPricesButton } from "@/components/refresh-prices-button";
import { presentBasket, presentMarks } from "@/lib/finance/basket-view";
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
  const [basket, livePrices] = await Promise.all([loadBasket(supabase), loadLivePrices(supabase)]);

  if (!basket.ok) return <SchemaNotice missing={basket.missingSchema} />;

  const view = presentBasket(basket.data);
  const marks = presentMarks(livePrices);

  return (
    <div>
      <PageHeader
        title="سبد دارایی"
        description="قیمت‌ها بعد از باز شدن صفحه در پس‌زمینه تازه می‌شوند. شاخص بنیادی با باز کردن زبانهٔ خودش خوانده می‌شود و اگر داده تازه باشد دوباره از بیرون گرفته نمی‌شود. با کلیک روی نام هر دارایی، رشد ارزش همان تعداد در قیمت‌های ذخیره‌شده باز می‌شود."
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
      />
    </div>
  );
}
