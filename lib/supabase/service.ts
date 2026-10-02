import { createClient } from "@supabase/supabase-js";
import type { FinanceClient } from "@/lib/finance/queries";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseUrl } from "@/lib/supabase/env";

/** Server-only. The weekly cron uses the secret key; browser code must not import this. */
export function createServiceClient(): FinanceClient | null {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) return null;
  return createClient<Database>(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
