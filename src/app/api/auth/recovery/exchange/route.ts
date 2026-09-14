import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const { code, flowId } = await request.json();

  if (!code || typeof code !== "string") {
    return Response.json({ error: "Code is required." }, { status: 400 });
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Route Handler — safe to ignore; we propagate via response.
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code, {
    flowId: typeof flowId === "string" ? flowId : undefined,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({
    ok: true,
    session: data.session,
    user: data.user,
  });
}
