import { DashboardShellSync } from "@/components/dashboard-shell-sync";
import { DashboardFrame } from "@/components/dashboard-nav";
import { requireSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <>
      <DashboardShellSync />
      <DashboardFrame email={session.email}>{children}</DashboardFrame>
    </>
  );
}
