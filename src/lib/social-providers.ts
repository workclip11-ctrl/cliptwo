// ---------------------------------------------------------------------------
// Social provider abstraction — OAuth initiation, callback, token exchange,
// ownership verification, and token refresh for Instagram, YouTube, and Kick.
//
// SECURITY: Tokens are NEVER returned to the browser. All token operations
// happen server-side via API routes that use service_role.
//
// Instagram: Uses Instagram API with Instagram Login path (graph.instagram.com)
// for profile/media endpoints. Token exchange still goes through Facebook's
// OAuth endpoints (same for both Instagram Login and Facebook Login paths).
//
// Kick: No public OAuth API available yet. The provider throws if called.
// ---------------------------------------------------------------------------

import type { Platform } from "./types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface OAuthInitResult {
  authorizationUrl: string;
  state: string;
  codeVerifier?: string; // PKCE code verifier (for YouTube/Google)
}

export interface OAuthCallbackResult {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
  providerAccountId: string;
  handle: string;
  avatarUrl?: string;
}

export interface OwnershipVerificationResult {
  verified: boolean;
  providerAccountId: string;
  handle: string;
  avatarUrl?: string;
  error?: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

export interface SocialProvider {
  platform: Platform;

  /** Generate OAuth authorization URL with state + optional PKCE */
  getAuthorizationUrl(userId: string, state: string): OAuthInitResult;

  /** Async version — computes PKCE code_challenge for providers that need it */
  getAuthorizationUrlAsync?(
    userId: string,
    state: string,
  ): Promise<OAuthInitResult>;

  /** Exchange authorization code for tokens and fetch user profile */
  exchangeCode(code: string, state: string, codeVerifier?: string): Promise<OAuthCallbackResult>;

  /** Verify that the connected account belongs to the claimed user */
  verifyOwnership(
    accessToken: string,
    claimedHandle: string,
  ): Promise<OwnershipVerificationResult>;

  /** Refresh an expired access token */
  refreshToken(refreshToken: string): Promise<TokenRefreshResult>;

  /** Revoke the token (disconnect) */
  revokeToken(accessToken: string): Promise<void>;

  /** Fetch current user profile from the provider */
  getProfile(accessToken: string): Promise<{
    handle: string;
    avatarUrl?: string;
    providerAccountId: string;
  }>;
}

// ── Instagram (Instagram API with Instagram Login) ──────────────────────────
//
// Uses Instagram Login path (graph.instagram.com) for profile, media, and
// insights endpoints. Token exchange goes through Facebook's OAuth endpoints
// which is the correct flow for Instagram Login as well.
//
// Permissions:
//   - instagram_business_basic: read profile, media, comments, mentions
//   - instagram_business_manage_insights: read account and media analytics
//
// Token lifecycle:
//   - Short-lived token (1 hour) from OAuth code exchange
// - Long-lived token (60 days) via fb_exchange_token grant
//   - Refresh long-lived token via ig_refresh_token grant (another 60 days)
//
// Current Graph API version: v18.0
// ---------------------------------------------------------------------------

class InstagramProvider implements SocialProvider {
  platform: Platform = "Instagram";

  private get clientId(): string {
    return process.env.INSTAGRAM_CLIENT_ID ?? "";
  }
  private get clientSecret(): string {
    return process.env.INSTAGRAM_CLIENT_SECRET ?? "";
  }
  private get redirectUri(): string {
    const base = process.env.NEXT_PUBLIC_APP_URL;
    if (!base) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "[social-providers] NEXT_PUBLIC_APP_URL must be set in production. " +
            "Set it to your deployed URL (e.g., https://cliptwo.vercel.app).",
        );
      }
      return "http://localhost:3000/api/social/oauth/callback/instagram";
    }
    return `${base}/api/social/oauth/callback/instagram`;
  }

  getAuthorizationUrl(_userId: string, state: string): OAuthInitResult {
    const scopes = ["instagram_business_basic", "instagram_business_manage_insights"];
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(","),
      response_type: "code",
      state,
    });

    return {
      authorizationUrl: `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`,
      state,
    };
  }

  async exchangeCode(
    code: string,
    _state: string,
    _codeVerifier?: string,
  ): Promise<OAuthCallbackResult> {
    // 1. Exchange code for short-lived token (Facebook OAuth endpoint)
    const tokenRes = await fetch(
      "https://graph.facebook.com/v18.0/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          code,
        }),
      },
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(
        `Instagram token exchange failed: ${err.error?.message ?? tokenRes.statusText}`,
      );
    }

    const tokenData = await tokenRes.json();

    // 2. Exchange for long-lived token (Facebook OAuth endpoint, fb_exchange_token grant)
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${this.clientId}&client_secret=${this.clientSecret}&fb_exchange_token=${tokenData.access_token}`,
    );

    let accessToken = tokenData.access_token;
    let expiresIn = tokenData.expires_in;

    if (longTokenRes.ok) {
      const longData = await longTokenRes.json();
      accessToken = longData.access_token;
      expiresIn = longData.expires_in;
    }

    // 3. Fetch user profile via Instagram API (graph.instagram.com)
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`,
    );

    if (!profileRes.ok) {
      const err = await profileRes.json().catch(() => ({}));
      throw new Error(
        `Instagram profile fetch failed: ${err.error?.message ?? profileRes.statusText}`,
      );
    }

    const profile = await profileRes.json();

    return {
      accessToken,
      refreshToken: null, // Instagram uses long-lived token refresh, not refresh tokens
      expiresIn,
      scope: tokenData.scope ?? "",
      providerAccountId: profile.id,
      handle: profile.username,
    };
  }

  async verifyOwnership(
    accessToken: string,
    claimedHandle: string,
  ): Promise<OwnershipVerificationResult> {
    try {
      const res = await fetch(
        `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`,
      );
      if (!res.ok) {
        return {
          verified: false,
          providerAccountId: "",
          handle: "",
          error: "Failed to fetch Instagram profile",
        };
      }
      const profile = await res.json();
      const verified =
        profile.username?.toLowerCase() === claimedHandle.toLowerCase();
      return {
        verified,
        providerAccountId: profile.id,
        handle: profile.username,
        error: verified
          ? undefined
          : `Handle mismatch: expected "${claimedHandle}", got "${profile.username}"`,
      };
    } catch (e) {
      return {
        verified: false,
        providerAccountId: "",
        handle: "",
        error: String(e),
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    // Instagram Login uses ig_refresh_token grant to refresh long-lived tokens.
    // The "refreshToken" parameter here is actually the long-lived access token.
    // Instagram doesn't use separate refresh tokens — the long-lived token itself
    // can be refreshed via the ig_refresh_token grant type.
    const res = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_refresh_token&client_secret=${this.clientSecret}&access_token=${refreshToken}`,
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Instagram token refresh failed: ${err.error?.message ?? res.statusText}`,
      );
    }

    const data = await res.json();

    return {
      accessToken: data.access_token,
      refreshToken: null, // Instagram doesn't use separate refresh tokens
      expiresIn: data.expires_in,
    };
  }

  async revokeToken(accessToken: string): Promise<void> {
    // Instagram Login does not provide a direct token revocation endpoint.
    // We clear the local token storage. The token will expire naturally
    // (60 days for long-lived tokens).
    void accessToken;
    // No API call — Meta does not provide a revoke endpoint for Instagram Login tokens.
  }

  async getProfile(accessToken: string): Promise<{
    handle: string;
    avatarUrl?: string;
    providerAccountId: string;
  }> {
    const res = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`,
    );
    const profile = await res.json();
    return {
      handle: profile.username,
      providerAccountId: profile.id,
    };
  }
}

// ── YouTube (Google OAuth 2.0) ──────────────────────────────────────────────

class YouTubeProvider implements SocialProvider {
  platform: Platform = "YouTube";

  private get clientId(): string {
    return process.env.YOUTUBE_CLIENT_ID ?? "";
  }
  private get clientSecret(): string {
    return process.env.YOUTUBE_CLIENT_SECRET ?? "";
  }
  private get redirectUri(): string {
    const base = process.env.NEXT_PUBLIC_APP_URL;
    if (!base) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "[social-providers] NEXT_PUBLIC_APP_URL must be set in production. " +
            "Set it to your deployed URL (e.g., https://cliptwo.vercel.app).",
        );
      }
      return "http://localhost:3000/api/social/oauth/callback/youtube";
    }
    return `${base}/api/social/oauth/callback/youtube`;
  }

  getAuthorizationUrl(userId: string, state: string): OAuthInitResult {
    const codeVerifier = generateCodeVerifier();

    const scopes = [
      "https://www.googleapis.com/auth/youtube.readonly",
    ];

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(" "),
      response_type: "code",
      state,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    return {
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
      codeVerifier,
    };
  }

  /** Async helper to get the full authorization URL with PKCE code_challenge */
  async getAuthorizationUrlAsync(
    userId: string,
    state: string,
  ): Promise<OAuthInitResult> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const scopes = [
      "https://www.googleapis.com/auth/youtube.readonly",
    ];

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(" "),
      response_type: "code",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    return {
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
      codeVerifier,
    };
  }

  async exchangeCode(
    code: string,
    _state: string,
    codeVerifier?: string,
  ): Promise<OAuthCallbackResult> {
    const body: Record<string, string> = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
    };
    if (codeVerifier) {
      body.code_verifier = codeVerifier;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(
        `YouTube token exchange failed: ${err.error_description ?? tokenRes.statusText}`,
      );
    }

    const tokenData = await tokenRes.json();

    // Fetch channel info
    const channelRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope ?? "",
      providerAccountId: channel?.id ?? "",
      handle: channel?.snippet?.title ?? "",
      avatarUrl: channel?.snippet?.thumbnails?.default?.url,
    };
  }

  async verifyOwnership(
    accessToken: string,
    claimedHandle: string,
  ): Promise<OwnershipVerificationResult> {
    try {
      const res = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        return {
          verified: false,
          providerAccountId: "",
          handle: "",
          error: "Failed to fetch YouTube channel",
        };
      }
      const data = await res.json();
      const channel = data.items?.[0];
      if (!channel) {
        return {
          verified: false,
          providerAccountId: "",
          handle: "",
          error: "No YouTube channel found for this account",
        };
      }
      const verified =
        channel.snippet?.title?.toLowerCase() === claimedHandle.toLowerCase();
      return {
        verified,
        providerAccountId: channel.id,
        handle: channel.snippet.title,
        avatarUrl: channel.snippet.thumbnails?.default?.url,
        error: verified
          ? undefined
          : `Channel mismatch: expected "${claimedHandle}", got "${channel.snippet.title}"`,
      };
    } catch (e) {
      return {
        verified: false,
        providerAccountId: "",
        handle: "",
        error: String(e),
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      throw new Error("YouTube token refresh failed");
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresIn: data.expires_in,
    };
  }

  async revokeToken(accessToken: string): Promise<void> {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${accessToken}`,
      { method: "POST" },
    ).catch(() => {
      // Best-effort revocation
    });
  }

  async getProfile(accessToken: string): Promise<{
    handle: string;
    avatarUrl?: string;
    providerAccountId: string;
  }> {
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json();
    const channel = data.items?.[0];
    return {
      handle: channel?.snippet?.title ?? "",
      avatarUrl: channel?.snippet?.thumbnails?.default?.url,
      providerAccountId: channel?.id ?? "",
    };
  }
}

// ── Kick (Not yet available) ────────────────────────────────────────────────
//
// Kick does not have a public OAuth API for third-party integrations.
// This provider throws on every operation. It exists so the Platform type
// and UI can reference Kick without using a fake mock provider.

class KickProvider implements SocialProvider {
  platform: Platform = "Kick";

  private throwNotAvailable(): never {
    throw new Error(
      "Kick integration is not yet available. Kick does not currently offer a public OAuth API for third-party applications.",
    );
  }

  getAuthorizationUrl(_userId: string, _state: string): OAuthInitResult {
    this.throwNotAvailable();
  }

  async exchangeCode(
    _code: string,
    _state: string,
    _codeVerifier?: string,
  ): Promise<OAuthCallbackResult> {
    this.throwNotAvailable();
  }

  async verifyOwnership(
    _accessToken: string,
    _claimedHandle: string,
  ): Promise<OwnershipVerificationResult> {
    this.throwNotAvailable();
  }

  async refreshToken(_refreshToken: string): Promise<TokenRefreshResult> {
    this.throwNotAvailable();
  }

  async revokeToken(_accessToken: string): Promise<void> {
    this.throwNotAvailable();
  }

  async getProfile(_accessToken: string): Promise<{
    handle: string;
    avatarUrl?: string;
    providerAccountId: string;
  }> {
    this.throwNotAvailable();
  }
}

// ── Provider factory ────────────────────────────────────────────────────────

function isConfigured(platform: Platform): boolean {
  switch (platform) {
    case "Instagram":
      return !!(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET);
    case "YouTube":
      return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
    case "Kick":
      return false; // No OAuth API available
    default:
      return false;
  }
}

/** Returns the real provider for the platform, or null if not available. */
export function getProvider(platform: Platform): SocialProvider {
  switch (platform) {
    case "Instagram":
      return new InstagramProvider();
    case "YouTube":
      return new YouTubeProvider();
    case "Kick":
      return new KickProvider();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Returns true if the platform has real OAuth credentials configured.
 * false = platform is not available (Kick) or credentials are missing.
 */
export function isPlatformAvailable(platform: Platform): boolean {
  return isConfigured(platform);
}

// ── PKCE helpers (for YouTube/Google) ───────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(array);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomBytes } = require("crypto") as typeof import("crypto");
    const buf = randomBytes(32);
    for (let i = 0; i < 32; i++) array[i] = buf[i];
  }
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export { isConfigured as isProviderConfigured };
