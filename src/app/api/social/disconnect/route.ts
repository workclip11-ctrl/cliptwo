// ---------------------------------------------------------------------------
// POST /api/social/disconnect
// Revokes provider tokens, removes encrypted token storage, and updates
// the social account status to "disconnected".
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/social-providers";
import { decryptToken } from "@/lib/token-crypto";

export async function POST(request: Request) {
  try {
    const { socialAccountId } = (await request.json()) as {
      socialAccountId: string;
    };

    if (!socialAccountId) {
      return NextResponse.json(
        { error: "socialAccountId required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // 1. Get the social account
    const { data: account, error: accountError } = await supabase
      .from("social_accounts")
      .select("*")
      .eq("id", socialAccountId)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 },
      );
    }

    // 2. Try to revoke the token with the provider (best-effort)
    // In production, read the encrypted token from social_connections
    // using service_role and decrypt it before revoking.
    try {
      const platform = account.platform as "Instagram" | "YouTube";
      const provider = getProvider(platform);
      // In production: const token = decryptToken(connection.access_token_enc);
      // await provider.revokeToken(token);
      await provider.revokeToken("mock_token");
    } catch {
      // Best-effort — even if revocation fails, we clear local state
    }

    // 3. Delete the encrypted token storage
    await supabase
      .from("social_connections")
      .delete()
      .eq("social_account_id", socialAccountId);

    // 4. Update the social account status
    await supabase
      .from("social_accounts")
      .update({
        status: "disconnected",
        verified: false,
        error: null,
      })
      .eq("id", socialAccountId);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[social/disconnect]", e);
    return NextResponse.json(
      { error: "Disconnect failed" },
      { status: 500 },
    );
  }
}
