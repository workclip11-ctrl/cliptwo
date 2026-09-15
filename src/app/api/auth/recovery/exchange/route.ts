import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { code, flowId } = await request.json();

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Code is required." }, { status: 400 });
  }

  const cookieStore = await cookies();

  const isSecure = (process.env.NEXT_PUBLIC_APP_URL || "").startsWith("https://");

  const pendingCookies: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            pendingCookies.push({ name, value, options });
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code, {
    flowId: typeof flowId === "string" ? flowId : undefined,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const response = NextResponse.json({
    ok: true,
    session: data.session,
    user: data.user,
  });

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, {
      ...options,
      secure: isSecure,
    } as Parameters<typeof response.cookies.set>[2]);
  }

  return response;
}
