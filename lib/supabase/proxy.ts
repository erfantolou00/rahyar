import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  emailFromClaims,
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseEnv,
  isAllowedEmail,
} from "@/lib/supabase/env";

const PUBLIC_PATHS = new Set(["/login", "/login/mfa", "/api/health", "/sw.js", "/manifest.webmanifest"]);

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!hasSupabaseEnv()) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    },
  );

  // Nothing may run between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.has(path);
  const isApi = path.startsWith("/api/");

  if (claims && !isAllowedEmail(emailFromClaims(claims))) {
    await supabase.auth.signOut();
    if (isPublic || isApi) return supabaseResponse;
    return redirectWithSession(request, supabaseResponse, "/login");
  }

  if (!claims && !isPublic && !isApi) {
    return redirectWithSession(request, supabaseResponse, "/login");
  }

  return supabaseResponse;
}

function redirectWithSession(
  request: NextRequest,
  supabaseResponse: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = supabaseResponse.headers.get(header);
    if (value) redirectResponse.headers.set(header, value);
  }
  return redirectResponse;
}
