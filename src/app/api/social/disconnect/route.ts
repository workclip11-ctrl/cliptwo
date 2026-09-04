// ---------------------------------------------------------------------------
// POST /api/social/disconnect
// Revokes provider tokens, removes encrypted token storage, and updates
// the social account status to "disconnected".
//
// Security model:
//   - Authenticates user via Bearer token (per-tab) or cookie fallback
//   - Uses service-role client for social_accounts/social_connections writes
//     (RLS policies were removed; these operations require elevated access)
//   - Verifies ownership before any modification
//   - Never exposes tokens to the browser
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
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

    // ── Step 1: Authenticate the user ──────────────────────────────────
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // ── Step 2: Service-role client for trusted DB operations ───────────
    const adminClient = createServiceClient();

    // ── Step 3: Get the social account (verify ownership) ──────────────
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

    // Ownership check: users can only disconnect their own accounts
    if (account.user_id !== authUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Step 4: Try to revoke the token with the provider ──────────────
    try {
      const platform = account.platform as "Instagram" | "YouTube";
      const provider = getProvider(platform);

      const { data: connection } = await adminClient
        .from("social_connections")
        .select("access_token_enc")
        .eq("social_account_id", socialAccountId)
        .single();

      if (connection?.access_token_enc) {
        const accessToken = decryptToken(connection.access_token_enc);
        await provider.revokeToken(accessToken);
      }
    } catch {
      // Best-effort — even if revocation fails, we clear local state
    }

    // ── Step 5: Delete the encrypted token storage ─────────────────────
    await adminClient
      .from("social_connections")
      .delete()
      .eq("social_account_id", socialAccountId);

    // ── Step 6: Update the social account status ───────────────────────
    await adminClient
      .from("social_accounts")
      .update({
        status: "disconnected",
        verified: false,
        error: null,
      })
      .eq("id", socialAccountId)
      .eq("user_id", authUser.id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[social/disconnect]", e);
    return NextResponse.json(
      { error: "Disconnect failed" },
      { status: 500 },
    );
  }
}
