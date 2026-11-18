import { historyCaption, type BookPoint, type CloseLeg, type HoldingClose } from "@/lib/finance/book-history";
import { toNumber } from "@/lib/finance/format";
import { shiftDays, todayKey } from "@/lib/finance/holding-growth";
import type { BasketSummary } from "@/lib/finance/portfolio";
import { missingSchema, type FinanceClient } from "@/lib/finance/queries";
import type { HoldingSnapshotRow, PortfolioSnapshotRow } from "@/lib/finance/types";

export type StoredBook = {
  totals: BookPoint[];
  holdings: HoldingClose[];
  missingSchema: boolean;
  caption: string;
};

const emptyBook: StoredBook = {
  totals: [],
  holdings: [],
  missingSchema: false,
  caption: historyCaption(0, false),
};

export function legsFromBasket(summary: BasketSummary): CloseLeg[] {
  return summary.rows.map((row) => ({
    assetId: row.id,
    quantity: row.quantity,
    price: row.displayCurrentPrice ?? row.currentPrice,
    value: row.currentValue ?? 0,
  }));
}

export async function syncBookClose(
  supabase: FinanceClient,
  userId: string,
  summary: BasketSummary,
  now = Date.now(),
): Promise<StoredBook> {
  const day = todayKey(now);
  const legs = legsFromBasket(summary);
  const saved = await writeClose(supabase, userId, day, summary.totalValue, legs);
  if (!saved.ok) {
    return { ...emptyBook, missingSchema: saved.missingSchema, caption: historyCaption(0, saved.missingSchema) };
  }
  return readBook(supabase, userId, day);
}

async function writeClose(
  supabase: FinanceClient,
  userId: string,
  day: string,
  total: number,
  legs: CloseLeg[],
): Promise<{ ok: true } | { ok: false; missingSchema: boolean }> {
  const book = await supabase.from("portfolio_snapshots").upsert(
    { user_id: userId, day, total_value: total, captured_at: new Date().toISOString() },
    { onConflict: "user_id,day" },
  );
  if (book.error) {
    console.error(book.error);
    return { ok: false, missingSchema: missingSchema(book.error) };
  }

  if (legs.length > 0) {
    const holdings = await supabase.from("holding_snapshots").upsert(
      legs.map((leg) => ({
        user_id: userId,
        asset_id: leg.assetId,
        day,
        quantity: leg.quantity,
        price: leg.price,
        value: leg.value,
        captured_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,asset_id,day" },
    );
    if (holdings.error) {
      console.error(holdings.error);
      return { ok: false, missingSchema: missingSchema(holdings.error) };
    }
  }

  const current = await supabase
    .from("holding_snapshots")
    .select("id,asset_id")
    .eq("user_id", userId)
    .eq("day", day);
  if (current.error) {
    console.error(current.error);
    return { ok: false, missingSchema: missingSchema(current.error) };
  }
  const keep = new Set(legs.map((leg) => leg.assetId));
  const drop = (current.data ?? []).filter((row) => !keep.has(row.asset_id)).map((row) => row.id);
  if (drop.length > 0) {
    const removed = await supabase.from("holding_snapshots").delete().in("id", drop);
    if (removed.error) return { ok: false, missingSchema: missingSchema(removed.error) };
  }
  return { ok: true };
}

export async function readBook(supabase: FinanceClient, userId: string, today = todayKey()): Promise<StoredBook> {
  const from = shiftDays(today, 400);
  const [totals, holdings] = await Promise.all([
    supabase
      .from("portfolio_snapshots")
      .select("day,total_value")
      .eq("user_id", userId)
      .gte("day", from)
      .order("day", { ascending: true }),
    supabase
      .from("holding_snapshots")
      .select("asset_id,day,price,value")
      .eq("user_id", userId)
      .gte("day", from)
      .order("day", { ascending: true }),
  ]);
  const error = totals.error ?? holdings.error;
  if (error) {
    console.error(error);
    const missing = missingSchema(error);
    return { ...emptyBook, missingSchema: missing, caption: historyCaption(0, missing) };
  }
  const points = ((totals.data ?? []) as Pick<PortfolioSnapshotRow, "day" | "total_value">[]).map((row) => ({
    day: row.day,
    value: toNumber(row.total_value),
  }));
  return {
    totals: points,
    holdings: ((holdings.data ?? []) as Pick<HoldingSnapshotRow, "asset_id" | "day" | "price" | "value">[]).map(
      (row) => ({
        assetId: row.asset_id,
        day: row.day,
        price: row.price == null ? null : toNumber(row.price),
        value: toNumber(row.value),
      }),
    ),
    missingSchema: false,
    caption: historyCaption(points.length, false),
  };
}
