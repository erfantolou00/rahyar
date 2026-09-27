import { NextResponse } from "next/server";
import { loadBasket } from "@/lib/finance/queries";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const basket = await loadBasket(session.supabase);
  if (!basket.ok) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  return NextResponse.json(basket.data);
}
