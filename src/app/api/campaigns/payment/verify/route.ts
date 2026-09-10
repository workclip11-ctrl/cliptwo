import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is an admin (defense-in-depth; RPC also checks)
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { paymentId } = body;

  if (!paymentId) {
    return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("verify_campaign_launch_payment", {
    p_payment_id: paymentId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
