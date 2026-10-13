import { AppBadge } from "@/components/app-badge";
import { DashboardFrame } from "@/components/dashboard-nav";
import { RememberPrices } from "@/components/remember-prices";
import { readRows } from "@/lib/finance/queries";
import type { Alert } from "@/lib/finance/types";
import { latestOfflinePrices, type OfflinePriceSource } from "@/lib/pwa/offline-prices";
import { requireSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [alerts, prices] = await Promise.all([
    readRows<Pick<Alert, "kind">>(session.supabase.from("alerts").select("kind").eq("is_active", true)),
    readRows<OfflinePriceSource>(
      session.supabase
        .from("prices")
        .select("asset_type, symbol, price, timestamp")
        .order("timestamp", { ascending: false })
        .limit(100),
    ),
  ]);
  const activeCount = alerts.ok
    ? alerts.data.filter((alert) => alert.kind !== "allocation_deviation").length
    : null;

  return (
    <>
      <AppBadge count={activeCount} />
      {prices.ok ? <RememberPrices rows={latestOfflinePrices(prices.data)} /> : null}
      <DashboardFrame email={session.email}>{children}</DashboardFrame>
    </>
  );
}
