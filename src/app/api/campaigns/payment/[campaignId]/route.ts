import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createClient } from "@supabase/supabase-js";
import { sanitizeError } from "@/lib/api-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { campaignId } = await params;
  if (!campaignId) {
    return NextResponse.json({ error: "Missing campaignId" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  // Verify caller is the campaign owner or an admin (defense-in-depth;
  // the RPC also enforces this, but we fail fast at the HTTP layer)
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("created_by")
    .eq("id", campaignId)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const isOwner = campaign.created_by === user.id;

  let isAdmin = false;
  if (!isOwner) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_campaign_launch_payment", {
    p_campaign_id: campaignId,
  });

  if (error) {
    return NextResponse.json({ error: sanitizeError(error.message) }, { status: 400 });
  }

  return NextResponse.json(data);
}
