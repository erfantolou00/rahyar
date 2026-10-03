import { NextResponse } from "next/server";
import { syncSymbolFundamentals } from "@/lib/finance/codal/sync";
import { parseSymbol } from "@/lib/finance/parse";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { symbol: raw } = await context.params;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const symbol = parseSymbol(decoded);
  if (!symbol) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const result = await syncSymbolFundamentals(session.supabase, session.userId, symbol);
  if (!result.ok) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(result.data);
}
