import { NextResponse } from "next/server";
import { toNumber } from "@/lib/finance/format";
import { buildHoldingSeries, cashFlows, dayKey, shiftDays, todayKey, type HoldingLot } from "@/lib/finance/holding-growth";
import { quoteSeriesKey } from "@/lib/finance/prices/match";
import type { FinanceClient } from "@/lib/finance/queries";
import type { AssetType } from "@/lib/finance/types";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const assetIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const series = quoteSeriesKey(asset.data.type, asset.data.symbol);
  const quotes = await loadDailyQuotes(session.supabase, series.assetType, series.symbol);
  const lots = await loadHoldingLots(session.supabase, asset.data.id, toNumber(asset.data.quantity));
  if (!lots) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const points = buildHoldingSeries({ lots, quotes });
  const listed = asset.data.type === "stock" || asset.data.type === "fund";
  const unit = !listed && asset.data.price_unit === "usd" ? "usd" : "rial";

  return NextResponse.json({
    symbol: asset.data.symbol,
    unit,
    points,
    flows: cashFlows(lots),
  });
}

async function loadHoldingLots(
  supabase: FinanceClient,
  assetId: string,
  quantity: number,
): Promise<HoldingLot[] | null> {
  const trades = await supabase
    .from("transactions")
    .select("type,qty,price,fee,date")
    .eq("asset_id", assetId)
    .in("type", ["buy", "sell", "deposit", "withdraw"])
    .order("date", { ascending: true });
  if (trades.error) {
    if (missingRelation(trades.error)) {
      return quantity > 0
        ? [{ day: "1970-01-01", side: "buy", quantity, price: null, fee: 0 }]
        : [];
    }
    console.error(trades.error);
    return null;
  }
  if ((trades.data ?? []).length === 0) {
    return quantity > 0 ? [{ day: "1970-01-01", side: "buy", quantity, price: null, fee: 0 }] : [];
  }
  return (trades.data ?? []).map((row) => ({
    day: row.date,
    side: row.type === "sell" || row.type === "withdraw" ? "sell" as const : "buy" as const,
    quantity: toNumber(row.qty),
    price: row.type === "deposit" || row.type === "withdraw" || row.price == null ? null : toNumber(row.price),
    fee: toNumber(row.fee),
  }));
}

function missingRelation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache|does not exist|could not find the/i.test(error.message ?? "")
  );
}

async function loadDailyQuotes(
  supabase: FinanceClient,
  assetType: AssetType,
  symbol: string,
): Promise<{ at: string; price: number }[]> {
  if (!symbol) return [];
  const since = shiftDays(todayKey(), 365 * 3);
  const days = await supabase
    .from("price_days")
    .select("day,price")
    .eq("asset_type", assetType)
    .eq("symbol", symbol)
    .gte("day", since)
    .order("day", { ascending: true })
    .limit(1200);
  if (!days.error) {
    return (days.data ?? [])
      .map((row) => ({ at: row.day, price: toNumber(row.price) }))
      .filter((row) => row.price > 0);
  }
  if (!missingRelation(days.error)) {
    console.error(days.error);
    return [];
  }

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
