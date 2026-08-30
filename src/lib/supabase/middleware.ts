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
  let user: { id: string; user_metadata?: Record<string, unknown> } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Ignore session errors (e.g. misconfigured env) so the request still proceeds.
  }

  const pathname = request.nextUrl.pathname;

  // ── Public routes that never need auth ──
  const isPublic =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/faq" ||
    pathname === "/campaigns" ||
    pathname.startsWith("/campaigns/") ||
    pathname.startsWith("/campaign/") ||
    pathname.startsWith("/clip/") ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/payout-policy" ||
    pathname === "/refund-policy" ||
    pathname === "/content-policy" ||
    pathname === "/community-guidelines" ||
    pathname === "/copyright" ||
    pathname === "/clipper-rules" ||
    pathname === "/creator-rules" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) return response;

  // ── Protected route: must be signed in ──
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Read the user's role from user_metadata.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const role: string =
    meta.role === "clipper" || meta.role === "creator" || meta.role === "admin"
      ? (meta.role as string)
      : "clipper";

  // ── Role-based route check ──
  const needed = requiredRole(pathname);
  if (needed && role !== needed) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROLE_DASHBOARD[needed] ?? "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
