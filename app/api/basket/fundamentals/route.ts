import { NextResponse } from "next/server";
import { presentFundamentals } from "@/lib/finance/basket-view";
import { ensureStockFundamentals } from "@/lib/finance/codal/sync";
import { ensureMarketReports } from "@/lib/finance/prices/market-report";
import { loadStockFundamentals } from "@/lib/finance/queries";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const assets = await session.supabase.from("assets").select("symbol").eq("type", "stock").order("symbol", { ascending: true });
  if (assets.error) {
    console.error(assets.error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const symbols = [...new Set((assets.data ?? []).map((row) => row.symbol.trim()).filter(Boolean))];
  await Promise.all([ensureStockFundamentals(session.supabase), ensureMarketReports(session.supabase)]);
  const fundamentals = await loadStockFundamentals(session.supabase);

  return NextResponse.json({
    rows: fundamentals.ok ? presentFundamentals(symbols, fundamentals.data) : [],
    schemaIssue: fundamentals.ok ? null : fundamentals.missingSchema,
  });
}
