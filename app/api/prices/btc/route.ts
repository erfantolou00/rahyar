import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/finance/prices/access";
import { fetchBtcQuote } from "@/lib/finance/prices/quotes";
import { storeQuotes } from "@/lib/finance/prices/refresh";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cron = isCronAuthorized(request);
  const session = cron ? null : await getAuthorizedSession();
  if (!cron && !session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const quote = await fetchBtcQuote();
  if (!quote) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const report = await storeQuotes([quote], session?.supabase);
  return NextResponse.json({ quote, ...report });
}
