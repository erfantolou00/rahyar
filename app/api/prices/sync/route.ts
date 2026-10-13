import { NextResponse } from "next/server";
import { ensureLivePrices } from "@/lib/finance/prices/ensure";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await ensureLivePrices(session.supabase, session.userId);
  return NextResponse.json(result);
}
