import { redirect } from "next/navigation";
import type { FinanceClient } from "@/lib/finance/queries";
import { createClient } from "@/lib/supabase/server";
import {
  emailFromClaims,
  hasSupabaseEnv,
  isAllowedEmail,
  userIdFromClaims,
} from "@/lib/supabase/env";

export type SessionContext = {
  supabase: FinanceClient;
  userId: string;
  email: string;
};

export async function getAuthorizedSession(): Promise<SessionContext | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const email = emailFromClaims(data.claims);
  const userId = userIdFromClaims(data.claims);
  if (!email || !userId || !isAllowedEmail(email)) return null;

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    return null;
  }

  return { supabase, userId, email };
}

export async function requireSession(): Promise<SessionContext> {
  if (!hasSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const email = emailFromClaims(data?.claims);
  const userId = userIdFromClaims(data?.claims);

  if (error || !data?.claims || !email || !userId || !isAllowedEmail(email)) {
    redirect("/login");
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    redirect("/login/mfa");
  }

  return { supabase, userId, email };
}
