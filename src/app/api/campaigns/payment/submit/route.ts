import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createClient } from "@supabase/supabase-js";
import { sanitizeError } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is a creator (defense-in-depth; RPC also checks)
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "creator" || profile.status !== "active") {
    return NextResponse.json(
      { error: "Only active creators can submit campaign payments" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { campaignId, utrReference } = body;

  if (!campaignId || !utrReference || !utrReference.trim()) {
    return NextResponse.json(
      { error: "campaignId and utrReference are required" },
      { status: 400 },
    );
  }

  // Validate UTR reference length (prevent storage bomb)
  const trimmedUtr = utrReference.trim();
  if (trimmedUtr.length > 50) {
    return NextResponse.json(
      { error: "UTR reference is too long (max 50 characters)" },
      { status: 400 },
    );
  }

  // Ownership check: verify the campaign belongs to this creator (defense-in-depth)
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("created_by")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 },
    );
  }

  if (campaign.created_by !== user.id) {
    return NextResponse.json(
      { error: "Access denied" },
      { status: 403 },
    );
  }

  const { data, error } = await supabase.rpc(
    "submit_campaign_launch_payment",
    {
      p_campaign_id: campaignId,
      p_utr_reference: trimmedUtr,
    },
  );

  if (error) {
    return NextResponse.json({ error: sanitizeError(error.message) }, { status: 400 });
  }

  return NextResponse.json(data);
}
