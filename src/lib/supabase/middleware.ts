import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isValidUrl(u?: string) {
  return !!u && (u.startsWith("http://") || u.startsWith("https://"));
}

// Route prefix → required role. If the user's role doesn't match, redirect.
const ROLE_ROUTES: Record<string, string> = {
  "/admin": "admin",
  "/clipper": "clipper",
  "/creator": "creator",
};

function requiredRole(pathname: string): string | null {
  for (const [prefix, role] of Object.entries(ROLE_ROUTES)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return role;
  }
  return null;
}

const ROLE_DASHBOARD: Record<string, string> = {
  admin: "/admin",
  clipper: "/clipper",
  creator: "/creator",
};

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured yet (e.g. placeholder env), just pass through.
  // Client-side guards (AdminGuard / AuthGuard) handle auth in local mode.
  if (!isValidUrl(url)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url as string, key as string, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser().
  // A simple mistake here can break the session refresh.
  try {
    await supabase.auth.getUser();
  } catch {
    // Ignore session errors (e.g. misconfigured env) so the request still proceeds.
  }

  // NOTE: Role-based route protection is handled client-side by AdminGuard /
  // AuthGuard in layout files. Server-side role checks are not possible when
  // the browser client stores sessions in sessionStorage (not cookies), so
  // the middleware only refreshes the session here.

  return response;
}
