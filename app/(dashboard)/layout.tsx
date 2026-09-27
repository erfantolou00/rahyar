import { DashboardNav } from "@/components/dashboard-nav";
import { requireSession } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-full">
      <DashboardNav email={session.email} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
