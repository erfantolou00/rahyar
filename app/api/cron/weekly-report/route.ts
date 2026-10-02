import { NextResponse } from "next/server";
import { interpretWeeklyReport } from "@/lib/ai/interpret-weekly";
import { cronAuthorized } from "@/lib/cron/auth";
import { publishWeeklyReport } from "@/lib/finance/publish-weekly";
import { createServiceClient } from "@/lib/supabase/service";

// Friday 16:30 UTC is 20:00 in Tehran. vercel.json schedules this route.
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
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await publishWeeklyReport(supabase, userId);
    if (!result.ok) {
      if (result.missingSchema) return NextResponse.json({ error: "unavailable" }, { status: 503 });
      failed += 1;
      continue;
    }
    if (result.status === "skipped") {
      skipped += 1;
      continue;
    }
    const interpreted = await interpretWeeklyReport(supabase, userId, result.id, { limit: false });
    if (!interpreted.ok) console.error(`Weekly interpretation was not saved: ${interpreted.code}`);
    created += 1;
  }

  return NextResponse.json({ ok: true, created, skipped, failed });
}

export function GET(request: Request) {
  return run(request);
}

export function POST(request: Request) {
  return run(request);
}
