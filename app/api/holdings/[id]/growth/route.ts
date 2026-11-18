import { NextResponse } from "next/server";
import { toNumber } from "@/lib/finance/format";
import { buildHoldingSeries, dayKey, shiftDays, todayKey, type GrowthTradeInput } from "@/lib/finance/holding-growth";
import type { FinanceClient } from "@/lib/finance/queries";
import { transactionTypes, type AssetType, type TransactionType } from "@/lib/finance/types";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const assetIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTradeType(value: string): value is TransactionType {
  return transactionTypes.some((type) => type === value);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!assetIdPattern.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const asset = await session.supabase
    .from("assets")
    .select("id,symbol,type,quantity,price_unit")
    .eq("id", id)
    .maybeSingle();
  if (asset.error) {
    console.error(asset.error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!asset.data) return NextResponse.json({ error: "missing" }, { status: 404 });

  const tradesResult = await session.supabase
    .from("transactions")
    .select("id,type,qty,price,date,note")
    .eq("asset_id", id)
    .order("date", { ascending: true });
  if (tradesResult.error) {
    console.error(tradesResult.error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const symbol = asset.data.symbol.trim();
  const quotes = await loadDailyQuotes(session.supabase, asset.data.type, symbol);
  const trades = (tradesResult.data ?? []).flatMap((row) => {
    if (!isTradeType(row.type)) return [];
    return [
      {
        id: row.id,
        at: row.date,
        type: row.type,
        qty: toNumber(row.qty),
        price: toNumber(row.price),
        note: row.note,
      },
    ];
  });
  const series = buildHoldingSeries({
    quantity: toNumber(asset.data.quantity),
    trades: trades.map(
      (trade): GrowthTradeInput => ({
        at: trade.at,
        type: trade.type,
        qty: trade.qty,
        price: trade.price,
      }),
    ),
    quotes,
  });
  const listed = asset.data.type === "stock" || asset.data.type === "fund";
  const unit = !listed && asset.data.price_unit === "usd" ? "usd" : "rial";

  return NextResponse.json({
    symbol: asset.data.symbol,
    unit,
    basis: series.basis,
    points: series.points,
    trades,
  });
}

async function loadDailyQuotes(
  supabase: FinanceClient,
  assetType: AssetType,
  symbol: string,
): Promise<{ at: string; price: number }[]> {
  if (!symbol) return [];
  const since = shiftDays(todayKey(), 365 * 3);
  const byDay = new Map<string, number>();
  const pageSize = 1000;

  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabase
      .from("prices")
      .select("price,timestamp")
      .eq("asset_type", assetType)
      .eq("symbol", symbol)
      .gte("timestamp", `${shiftDays(since, 1)}T00:00:00.000Z`)
      .order("timestamp", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) {
      console.error(error);
      break;
    }
    if (!data?.length) break;

    let oldest = "";
    for (const row of data) {
      const day = dayKey(row.timestamp);
      const price = toNumber(row.price);
      if (price > 0 && !byDay.has(day)) byDay.set(day, price);
      if (!oldest || day < oldest) oldest = day;
    }
    if (data.length < pageSize || oldest <= since) break;
  }

  return [...byDay.entries()].map(([at, price]) => ({ at, price }));
}
