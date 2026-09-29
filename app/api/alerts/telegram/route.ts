import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchTelegramAlerts } from "@/lib/telegram/dispatch";
import { getAuthorizedSession } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ALERT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secretAuthorized(request: Request): boolean {
  const expected = process.env.TELEGRAM_DISPATCH_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (!expected || !header?.toLowerCase().startsWith("bearer ")) return false;
  const provided = header.slice(header.indexOf(" ") + 1).trim();
  const actual = createHash("sha256").update(provided).digest();
  const wanted = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actual, wanted);
}

function readTarget(body: unknown): { ignore: true } | { error: "invalid" } | { alertId?: string } {
  if (!body || typeof body !== "object") return {};
  const value = body as {
    type?: unknown;
    table?: unknown;
    record?: { id?: unknown } | null;
    alert_id?: unknown;
  };

  if (typeof value.type === "string" && value.type !== "INSERT") return { ignore: true };
  if (typeof value.table === "string" && value.table !== "alerts") return { ignore: true };

  const raw = value.record && typeof value.record === "object" ? value.record.id : value.alert_id;
  if (raw == null || raw === "") return {};
  if (typeof raw !== "string" || !ALERT_ID.test(raw)) return { error: "invalid" };
  return { alertId: raw };
}

export async function POST(request: Request) {
  const bySecret = secretAuthorized(request);
  const session = bySecret ? null : await getAuthorizedSession();
  if (!bySecret && !session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const target = readTarget(body);
  if ("error" in target) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if ("ignore" in target) return NextResponse.json({ ignored: true });

  const supabase = bySecret ? createAdminClient() : session?.supabase;
  if (!supabase) return NextResponse.json({ error: "missing_service_key" }, { status: 503 });

  const result = await dispatchTelegramAlerts(supabase, { alertId: target.alertId });
  if (!result.ok) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  return NextResponse.json({
    sent: result.sent,
    failed: result.failed,
    waiting: result.waiting,
    skipped: result.skipped,
    missingChat: result.missingChat,
  });
}
