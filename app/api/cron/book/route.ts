import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron/auth";
import { syncBookClose } from "@/lib/finance/snapshots";
import { loadBasket } from "@/lib/finance/queries";
import { createServiceClient } from "@/lib/supabase/service";

// 17:00 UTC is 20:30 in Tehran. vercel.json schedules this route.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || null;
  if (!secret) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!cronAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const owners = await supabase.from("assets").select("user_id");
  if (owners.error) {
    console.error(owners.error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const userIds = [...new Set((owners.data ?? []).map((row) => row.user_id))];
  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const basket = await loadBasket(supabase, userId);
    if (!basket.ok) {
      if (basket.missingSchema) return NextResponse.json({ error: "unavailable" }, { status: 503 });
      failed += 1;
      continue;
    }
    if (basket.data.rows.length === 0) {
      skipped += 1;
      continue;
    }
    const book = await syncBookClose(supabase, userId, basket.data);
    if (book.missingSchema) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    if (book.totals.length === 0) {
      failed += 1;
      continue;
    }
    saved += 1;
  }

  return NextResponse.json({ ok: true, saved, skipped, failed });
}

export function GET(request: Request) {
  return run(request);
}

export function POST(request: Request) {
  return run(request);
}
