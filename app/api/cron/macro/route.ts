import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron/auth";
import { syncMacroIndicators } from "@/lib/finance/macro/sync";
import { createServiceClient } from "@/lib/supabase/service";

// Monday 13:00 UTC is 16:30 in Tehran. vercel.json schedules this route.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || null;
  if (!secret) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!cronAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const result = await syncMacroIndicators(supabase);
  if (!result.ok) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, stored: result.stored });
}

export function GET(request: Request) {
  return run(request);
}

export function POST(request: Request) {
  return run(request);
}
