import { NextResponse } from "next/server";
import { loadLatestPrices } from "@/lib/finance/queries";
import { latestOfflinePrices, type OfflinePriceSource } from "@/lib/pwa/offline-prices";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [alerts, prices] = await Promise.all([
    session.supabase.from("alerts").select("kind").eq("is_active", true).eq("user_id", session.userId),
    loadLatestPrices(session.supabase, [], session.userId),
  ]);

  const badge = alerts.error
    ? 0
    : (alerts.data ?? []).filter((alert) => alert.kind !== "allocation_deviation").length;
  const rows: OfflinePriceSource[] = prices.ok
    ? prices.data.map((row) => ({
        asset_type: row.asset_type,
        symbol: row.symbol,
        price: row.price,
        timestamp: row.timestamp,
      }))
    : [];

  return NextResponse.json({ badge, prices: latestOfflinePrices(rows) });
}
