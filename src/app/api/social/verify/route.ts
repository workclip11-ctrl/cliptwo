// ---------------------------------------------------------------------------
// POST /api/social/verify
// Server-side ownership verification for a connected social account.
// Fetches the profile from the provider using stored tokens and checks
// that the handle matches what the user claimed.
//
// Uses service_role to read encrypted tokens from social_connections
// (RLS blocks browser SELECT on token columns).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/social-providers";
import { decryptToken, isTokenExpired } from "@/lib/token-crypto";

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

    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createServiceClient();

    // 1. Get the social account
    const { data: account, error: accountError } = await adminClient
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

    if (account.user_id !== authUser.id) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 },
      );
    }

    // 2. Get the encrypted tokens from social_connections using service_role
    const { data: connection, error: connError } = await adminClient
      .from("social_connections")
      .select("access_token_enc, refresh_token_enc, expires_at")
      .eq("social_account_id", socialAccountId)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "No tokens found for this account. Reconnect the account first." },
        { status: 400 },
      );
    }

    // 3. Check if token is expired
    if (isTokenExpired(connection.expires_at)) {
      return NextResponse.json(
        { error: "Token expired. Reconnect the account to refresh tokens." },
        { status: 400 },
      );
    }

    // 4. Decrypt and use the real token
    const accessToken = decryptToken(connection.access_token_enc);

    // 5. Determine provider
    const platform = account.platform as "Instagram" | "YouTube";
    const provider = getProvider(platform);

    // 6. Verify ownership with the real token
    const verification = await provider.verifyOwnership(
      accessToken,
      account.handle,
    );

    // 7. Update verification status (use service-role to bypass trigger restrictions
    // on trusted fields: verified, provider_account_id)
    if (verification.verified) {
      await adminClient
        .from("social_accounts")
        .update({
          verified: true,
          provider_account_id: verification.providerAccountId,
        })
        .eq("id", socialAccountId)
        .eq("user_id", authUser.id);

      // Update connection verification timestamp
      await adminClient
        .from("social_connections")
        .update({
          verified_at: new Date().toISOString(),
          verification_data: verification,
        })
        .eq("social_account_id", socialAccountId);
    }

    return NextResponse.json({
      verified: verification.verified,
      handle: verification.handle,
      error: verification.error,
    });
  } catch (e) {
    console.error("[social/verify]", e);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 },
    );
  }
}
