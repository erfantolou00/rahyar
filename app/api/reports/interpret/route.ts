import { NextResponse } from "next/server";
import { interpretWeeklyReport } from "@/lib/ai/interpret-weekly";
import { getAuthorizedSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const session = await getAuthorizedSession();
  if (!session) {
    return NextResponse.json({ ok: false, stored: false, message: "ابتدا وارد شوید." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, stored: false, message: "درخواست خوانده نشد." }, { status: 400 });
  }

  const reportId =
    body && typeof body === "object" && "reportId" in body
      ? String((body as { reportId?: unknown }).reportId ?? "")
      : "";
  if (!REPORT_ID.test(reportId)) {
    return NextResponse.json({ ok: false, stored: false, message: "گزارش مشخص نیست." }, { status: 400 });
  }

  const result = await interpretWeeklyReport(session.supabase, session.userId, reportId);
  const status = result.ok
    ? 200
    : result.code === "rate_limit"
      ? 429
      : result.code === "invalid"
        ? 404
        : result.code === "missing_key" || result.code === "invalid_key"
          ? 503
          : result.code === "timeout"
            ? 504
            : 502;
  return NextResponse.json(
    {
      ok: result.ok,
      stored: result.ok ? true : result.stored,
      message: result.ok ? result.commentary : result.message,
    },
    { status },
  );
}
