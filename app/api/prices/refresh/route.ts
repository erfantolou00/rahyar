import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/finance/prices/access";
import { refreshAllPrices } from "@/lib/finance/prices/refresh";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cron = isCronAuthorized(request);
  const session = cron ? null : await getAuthorizedSession();
  if (!cron && !session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = await refreshAllPrices(session?.supabase);
  return NextResponse.json(report);
}
