import { NextResponse } from "next/server";
import { assetOwnerIds } from "@/lib/cron/owners";
import { cronAuthorized } from "@/lib/cron/auth";
import { syncOwnerDeviations } from "@/lib/finance/owner-sync";
import { ensureLivePrices } from "@/lib/finance/prices/ensure";
import { createServiceClient } from "@/lib/supabase/service";

// vercel.json calls this through the Tehran cash session (Sat–Wed 09:00–13:00) about every 15 minutes,
// plus once each evening. Each expression runs at most once per day so a Hobby deploy stays valid.
// Listed shares are stored only inside that session. Dollar, gold, coins, and bitcoin refresh when older than 15 minutes.
// Deviation rows and notifications are written here, not when a page opens.
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

  let refreshed = 0;
  let checked = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const prices = await ensureLivePrices(supabase, userId);
      if (prices.refreshed) refreshed += 1;
      const synced = await syncOwnerDeviations(supabase, userId);
      if (!synced.ok) {
        failed += 1;
        continue;
      }
      checked += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron prices] ${userId} failed: ${message}`);
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, refreshed, checked, failed });
}

export function GET(request: Request) {
  return run(request);
}

export function POST(request: Request) {
  return run(request);
}
