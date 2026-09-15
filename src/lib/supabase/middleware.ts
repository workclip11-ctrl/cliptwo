import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isValidUrl(u?: string) {
  return !!u && (u.startsWith("http://") || u.startsWith("https://"));
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured yet (e.g. placeholder env), just pass through.
  if (!isValidUrl(url)) {
    return NextResponse.next({ request });
  }

  // --- PKCE password-recovery exchange ---
  // When the user clicks the reset link, the browser navigates to:
  //   /reset-password?code=<authCode>&sb_flow_id=<flowId>
  // We intercept this GET, exchange the code for a session server-side
  // (where the PKCE verifier cookies are guaranteed to be sent), then
  // redirect to /reset-password without query params.
  const pathname = request.nextUrl.pathname;
  if (pathname === "/reset-password") {
    const code = request.nextUrl.searchParams.get("code");
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");

    if (code && flowId) {
      const pendingCookies: {
        name: string;
        value: string;
        options?: Record<string, unknown>;
      }[] = [];

      const supabase = createServerClient(url as string, key as string, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const c of cookiesToSet) {
              request.cookies.set(c.name, c.value);
              pendingCookies.push(c);
            }
          },
        },
      });

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code, {
          flowId,
        });

        if (!error) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = "/reset-password";
          redirectUrl.search = "";
          const res = NextResponse.redirect(redirectUrl);
          for (const c of pendingCookies) {
            res.cookies.set(c.name, c.value, c.options as Parameters<typeof res.cookies.set>[2]);
          }
          return res;
        }
      } catch {
        // Exchange failed — fall through to redirect with error.
      }

      const errorUrl = request.nextUrl.clone();
      errorUrl.pathname = "/reset-password";
      errorUrl.search = "";
      errorUrl.hash = "error=reset_expired";
      return NextResponse.redirect(errorUrl);
    }
  }

  // --- Normal session refresh for all other routes ---
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

  return response;
}
