import { NextResponse } from "next/server";
import { loadPortfolio } from "@/lib/finance/queries";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const portfolio = await loadPortfolio(session.supabase);
  if (!portfolio.ok) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  return NextResponse.json(portfolio.data);
}
