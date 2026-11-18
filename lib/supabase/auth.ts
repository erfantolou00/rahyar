import { redirect } from "next/navigation";
import { cache } from "react";
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

type ResolvedSession =
  | { kind: "ok"; session: SessionContext }
  | { kind: "login" }
  | { kind: "mfa" };

const resolveSession = cache(async function resolveSession(): Promise<ResolvedSession> {
  if (!hasSupabaseEnv()) return { kind: "login" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const email = emailFromClaims(data?.claims);
  const userId = userIdFromClaims(data?.claims);
  if (error || !data?.claims || !email || !userId || !isAllowedEmail(email)) {
    return { kind: "login" };
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    return { kind: "mfa" };
  }

  return { kind: "ok", session: { supabase, userId, email } };
});

export async function getAuthorizedSession(): Promise<SessionContext | null> {
  const resolved = await resolveSession();
  return resolved.kind === "ok" ? resolved.session : null;
}

export async function requireSession(): Promise<SessionContext> {
  const resolved = await resolveSession();
  if (resolved.kind === "mfa") redirect("/login/mfa");
  if (resolved.kind !== "ok") redirect("/login");
  return resolved.session;
}
