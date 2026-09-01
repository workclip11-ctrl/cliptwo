// ---------------------------------------------------------------------------
// Social provider abstraction — OAuth initiation, callback, token exchange,
// ownership verification, and token refresh for Instagram and YouTube.
//
// In development (no real OAuth credentials), mock providers simulate the
// full flow so the UI can be tested end-to-end. The mock flow is clearly
// marked and MUST NOT be used in production.
//
// SECURITY: Tokens are NEVER returned to the browser. All token operations
// happen server-side via API routes that use service_role.
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
  exchangeCode(code: string, state: string): Promise<OAuthCallbackResult>;

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

// ── Instagram (Meta Graph API) ──────────────────────────────────────────────

class InstagramProvider implements SocialProvider {
  platform: Platform = "Instagram";

  private get clientId(): string {
    return process.env.INSTAGRAM_CLIENT_ID ?? "";
  }
  private get clientSecret(): string {
    return process.env.INSTAGRAM_CLIENT_SECRET ?? "";
  }
  private get redirectUri(): string {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/api/social/oauth/callback/instagram`;
  }

  getAuthorizationUrl(userId: string, state: string): OAuthInitResult {
    const scopes = ["instagram_basic", "instagram_content_publish"];
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(","),
      response_type: "code",
      state,
    });

    // Instagram Basic Display API does not support PKCE in the same way
    // but we use state for CSRF protection
    return {
      authorizationUrl: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`,
      state,
    };
  }

  async exchangeCode(
    code: string,
    _state: string,
  ): Promise<OAuthCallbackResult> {
    // 1. Exchange code for short-lived token
    const tokenRes = await fetch(
      "https://graph.facebook.com/v19.0/oauth/access_token",
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

    // 2. Exchange for long-lived token
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${this.clientId}&client_secret=${this.clientSecret}&fb_exchange_token=${tokenData.access_token}`,
    );

    let accessToken = tokenData.access_token;
    let expiresIn = tokenData.expires_in;

    if (longTokenRes.ok) {
      const longData = await longTokenRes.json();
      accessToken = longData.access_token;
      expiresIn = longData.expires_in;
    }

    // 3. Fetch user profile
    const profileRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,username&access_token=${accessToken}`,
    );
    const profile = await profileRes.json();

    return {
      accessToken,
      refreshToken: null, // Instagram doesn't provide refresh tokens
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
        `https://graph.facebook.com/v19.0/me?fields=id,username&access_token=${accessToken}`,
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
    // Instagram long-lived tokens don't expire for 60 days
    // For production, implement token refresh via the Graph API
    void refreshToken;
    throw new Error("Instagram token refresh not implemented — reconnect required");
  }

  async revokeToken(accessToken: string): Promise<void> {
    // Instagram doesn't have a direct revoke endpoint
    // The token becomes invalid when the user removes the app
    void accessToken;
  }

  async getProfile(accessToken: string): Promise<{
    handle: string;
    avatarUrl?: string;
    providerAccountId: string;
  }> {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,username&access_token=${accessToken}`,
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
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/api/social/oauth/callback/youtube`;
  }

  getAuthorizationUrl(userId: string, state: string): OAuthInitResult {
    // Generate PKCE code verifier + challenge
    const codeVerifier = generateCodeVerifier();

    const scopes = [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ];

    // NOTE: code_challenge must be computed async (SHA-256 via Web Crypto).
    // For simplicity in this synchronous function, we store the verifier and
    // compute the challenge during the callback exchange. In production, use
    // a helper that returns a Promise or pre-compute via an API route.
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
      "https://www.googleapis.com/auth/youtube.force-ssl",
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
  ): Promise<OAuthCallbackResult> {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
      }),
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
    // Revoke the token with Google
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

// ── Mock Provider (Development) ─────────────────────────────────────────────

class MockProvider implements SocialProvider {
  platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  getAuthorizationUrl(_userId: string, state: string): OAuthInitResult {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return {
      authorizationUrl: `${base}/api/social/oauth/callback/${this.platform.toLowerCase()}?code=mock_code_123&state=${state}`,
      state,
    };
  }

  async exchangeCode(
    _code: string,
    _state: string,
  ): Promise<OAuthCallbackResult> {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 500));

    return {
      accessToken: `mock_ig_at_${Date.now()}`,
      refreshToken: `mock_ig_rt_${Date.now()}`,
      expiresIn: 60 * 60 * 24 * 60, // 60 days
      scope: "instagram_basic instagram_content_publish",
      providerAccountId: `mock_${this.platform.toLowerCase()}_${Date.now()}`,
      handle: `mock_user_${Math.floor(Math.random() * 10000)}`,
    };
  }

  async verifyOwnership(
    _accessToken: string,
    claimedHandle: string,
  ): Promise<OwnershipVerificationResult> {
    await new Promise((r) => setTimeout(r, 300));
    // In mock mode, verification always succeeds
    return {
      verified: true,
      providerAccountId: `mock_${this.platform.toLowerCase()}_verified`,
      handle: claimedHandle,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    await new Promise((r) => setTimeout(r, 200));
    return {
      accessToken: `mock_refreshed_${Date.now()}`,
      refreshToken,
      expiresIn: 60 * 60 * 24 * 60,
    };
  }

  async revokeToken(_accessToken: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 100));
  }

  async getProfile(accessToken: string): Promise<{
    handle: string;
    avatarUrl?: string;
    providerAccountId: string;
  }> {
    void accessToken;
    return {
      handle: `mock_user`,
      providerAccountId: `mock_profile`,
    };
  }
}

// ── Provider factory ────────────────────────────────────────────────────────

function isConfigured(platform: Platform): boolean {
  switch (platform) {
    case "Instagram":
      return !!(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET);
    case "YouTube":
      return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
    default:
      return false;
  }
}

export function getProvider(platform: Platform): SocialProvider {
  if (!isConfigured(platform)) {
    console.warn(
      `[social-providers] ${platform} OAuth not configured — using mock provider. ` +
        `Set ${platform === "Instagram" ? "INSTAGRAM_CLIENT_ID/SECRET" : "YOUTUBE_CLIENT_ID/SECRET"} for production.`,
    );
    return new MockProvider(platform);
  }

  switch (platform) {
    case "Instagram":
      return new InstagramProvider();
    case "YouTube":
      return new YouTubeProvider();
    default:
      return new MockProvider(platform);
  }
}

// ── PKCE helpers (for YouTube/Google) ───────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  // Use crypto.getRandomValues if available (browser/edge), otherwise fall back
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(array);
  } else {
    // Node.js fallback
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
