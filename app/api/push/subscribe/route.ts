import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

type PushBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function readSubscription(body: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!body || typeof body !== "object") return null;
  const value = body as PushBody;
  const endpoint = value.endpoint;
  const p256dh = value.keys?.p256dh;
  const auth = value.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 2000) return null;
  if (typeof p256dh !== "string" || p256dh.length < 1 || p256dh.length > 200) return null;
  if (typeof auth !== "string" || auth.length < 1 || auth.length > 200) return null;
  return { endpoint, p256dh, auth };
}

export async function POST(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const subscription = readSubscription(body);
  if (!subscription) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const { error } = await session.supabase.from("push_subscriptions").upsert(
    {
      user_id: session.userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "save" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
