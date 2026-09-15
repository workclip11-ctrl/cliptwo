import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { code, flowId } = await request.json();

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Code is required." }, { status: 400 });
  }

  const cookieStore = await cookies();

  const incomingCookies = cookieStore.getAll();
  const incomingNames = incomingCookies.map((c) => c.name);
  const flowIdStr = typeof flowId === "string" ? flowId : null;
  const hasLegacy = incomingNames.includes("supabase.auth.token-code-verifier");
  const hasFlowIndex = incomingNames.includes(
    "supabase.auth.token-flows-code-verifier",
  );
  const hasSlot = flowIdStr
    ? incomingNames.includes(
        `supabase.auth.token-flow-${flowIdStr}-code-verifier`,
      )
    : false;
  const hasAnyVerifier = incomingNames.some((n) => n.endsWith("-code-verifier"));

  console.log(
    "[DIAG exchange] flowId present:",
    !!flowIdStr,
    "len:",
    flowIdStr?.length,
  );
  console.log("[DIAG exchange] incoming cookie count:", incomingCookies.length);
  console.log("[DIAG exchange] incoming cookie names:", incomingNames);
  console.log("[DIAG exchange] slot found:", hasSlot);
  console.log("[DIAG exchange] legacy found:", hasLegacy);
  console.log("[DIAG exchange] flow index found:", hasFlowIndex);
  console.log("[DIAG exchange] any verifier cookie:", hasAnyVerifier);

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
    const errResponse = NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
    errResponse.headers.set(
      "x-diag-exchange-cookie-count",
      String(incomingCookies.length),
    );
    errResponse.headers.set(
      "x-diag-exchange-cookie-names",
      incomingNames.join(","),
    );
    errResponse.headers.set("x-diag-slot-exists", String(hasSlot));
    errResponse.headers.set("x-diag-flow-id-present", String(!!flowIdStr));
    return errResponse;
  }

  const response = NextResponse.json({
    ok: true,
    session: data.session,
    user: data.user,
  });

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(
      name,
      value,
      options as Parameters<typeof response.cookies.set>[2],
    );
  }

  response.headers.set(
    "x-diag-exchange-cookie-count",
    String(incomingCookies.length),
  );
  response.headers.set(
    "x-diag-exchange-cookie-names",
    incomingNames.join(","),
  );
  response.headers.set("x-diag-slot-exists", String(hasSlot));
  response.headers.set("x-diag-flow-id-present", String(!!flowIdStr));

  return response;
}
