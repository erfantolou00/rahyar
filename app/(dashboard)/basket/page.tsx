import type { Metadata } from "next";
import { BasketBoard } from "@/components/basket/basket-board";
import { LedgerPanel } from "@/components/basket/ledger-panel";
import { RebuildHistoryButton } from "@/components/basket/rebuild-history-button";
import type { HoldingChart } from "@/components/basket/asset-detail-dialog";
import { Notice, Panel, SchemaNotice, errorMessage } from "@/components/chrome";
import { presentBasket, presentClassWeights, presentMarks } from "@/lib/finance/basket-view";
import { holdingChart } from "@/lib/finance/book-history";
import { formatDay, toNumber } from "@/lib/finance/format";
import { todayKey } from "@/lib/finance/holding-growth";
import { loadBasket, loadLedger, loadLivePrices } from "@/lib/finance/queries";
import { syncBookClose } from "@/lib/finance/snapshots";
import { decorateSlices } from "@/lib/overview/view";
import { userIdFromClaims } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "سبد دارایی" };

export default async function BasketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [basket, livePrices, ledger] = await Promise.all([
    loadBasket(supabase),
    loadLivePrices(supabase),
    loadLedger(supabase),
  ]);

  if (!basket.ok) return <SchemaNotice missing={basket.missingSchema} />;

  const view = presentBasket(basket.data);
  const marks = presentMarks(livePrices);
  const claims = basket.data.rows.length > 0 ? await supabase.auth.getClaims() : null;
  const userId = userIdFromClaims(claims?.data?.claims);
  const book = userId ? await syncBookClose(supabase, userId, basket.data) : null;
  const today = todayKey();
  const charts: Record<string, HoldingChart> = {};
  for (const row of basket.data.rows) {
    const history = (book?.holdings ?? []).filter((item) => item.assetId === row.id);
    const chart = holdingChart(history, today, {
      price: row.displayCurrentPrice ?? row.currentPrice,
      value: row.currentValue ?? 0,
    });
    charts[row.id] = {
      basis: chart.basis,
      points: chart.points.map((point) => ({ label: formatDay(point.at), value: point.value })),
      note: book?.missingSchema ? book.caption : undefined,
    };
  }

  return (
    <div>
      <Notice message={errorMessage(params.error)} />
      <BasketBoard
        key={view.rows.map((row) => `${row.id}:${row.values.quantity}:${row.values.avg_buy_price}`).join("|")}
        marks={marks}
        rows={view.rows}
        charts={charts}
        slices={decorateSlices(presentClassWeights(basket.data))}
        totalValue={view.totalValue}
        totalAbsolute={view.totalAbsolute}
        totalPercent={view.totalPercent}
        totalTone={view.totalTone}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <LedgerPanel
          ready={ledger.ready}
          accounts={ledger.accounts.map((account) => ({
            id: account.id,
            name: account.name,
            kind: account.kind,
            currency: account.currency,
          }))}
          positions={ledger.positions.map((position) => ({
            accountId: position.account_id,
            assetId: position.asset_id,
            name: basket.data.rows.find((row) => row.id === position.asset_id)?.name ?? "",
            quantity: toNumber(position.quantity),
          }))}
          holdings={basket.data.rows.map((row) => ({
            id: row.id,
            name: row.name,
            currency: row.priceUnit === "usd" ? "usd" : "rial",
          }))}
        />
        <Panel title="تاریخچه صورت‌ها">
          <RebuildHistoryButton />
        </Panel>
      </div>
    </div>
  );
}
