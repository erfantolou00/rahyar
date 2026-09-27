export function hasSupabaseEnv(): boolean {
  return Boolean(readSupabaseUrl() && readSupabaseKey());
}

export function hasAllowlist(): boolean {
  return Boolean(process.env.ALLOWED_USER_EMAIL?.trim());
}

export function getSupabaseUrl(): string {
  const url = readSupabaseUrl();
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  return url;
}

export function getSupabasePublishableKey(): string {
  const key = readSupabaseKey();
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return key;
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = process.env.ALLOWED_USER_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}

export function emailFromClaims(
  claims: { email?: unknown } | null | undefined,
): string | null {
  return typeof claims?.email === "string" ? claims.email : null;
}

export function userIdFromClaims(
  claims: { sub?: unknown } | null | undefined,
): string | null {
  return typeof claims?.sub === "string" ? claims.sub : null;
}

function readSupabaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return url || null;
}

function readSupabaseKey(): string | null {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return key || null;
}
