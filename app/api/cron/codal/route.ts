import { NextResponse } from "next/server";
import { assetOwnerIds } from "@/lib/cron/owners";
import { cronAuthorized } from "@/lib/cron/auth";
import { ensureStockFundamentals } from "@/lib/finance/codal/sync";
import { ensureMarketReports } from "@/lib/finance/prices/market-report";
import { createServiceClient } from "@/lib/supabase/service";

// 10:00 UTC is 13:30 in Tehran, after the cash session. vercel.json schedules this route.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function run(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || null;
  if (!secret) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!cronAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const userIds = await assetOwnerIds(supabase);
  if (!userIds) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  let checked = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      await ensureStockFundamentals(supabase, userId);
      await ensureMarketReports(supabase, userId);
      checked += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron codal] ${userId} failed: ${message}`);
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, checked, failed });
}

export function GET(request: Request) {
  return run(request);
}

export function POST(request: Request) {
  return run(request);
}
