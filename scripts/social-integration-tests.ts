// ---------------------------------------------------------------------------
// Regression tests: Instagram + YouTube OAuth connection and metric sync.
//
// Run: npm run test:social   (Node ≥ 22.6 type-stripping; verified on Node 24)
//
// Covers, with mocked provider APIs (no network, no real tokens):
//   - OAuth state validation (expiry / platform / not-found — fail-closed)
//   - OAuth authorize URL construction (scopes, PKCE, no client_secret in URL)
//   - Code exchange chains (Instagram short→long-lived, YouTube + PKCE)
//   - Ownership verification (provider-level and shared metric-ownership helper)
//   - Instagram shortcode extraction + media field request tiers (likes/comments/shares)
//   - Instagram insights fail-closed semantics (never verified-0 for unavailable)
//   - YouTube video ID extraction and API failure → throw (never fabricate 0)
//   - Token encryption roundtrip + expiry helpers (pre-expiry refresh window)
//   - Token refresh paths (IG ig_refresh_token, YouTube refresh_token)
//   - YouTube batch fetchAccountMetrics (implemented, ownership-filtered)
//   - Production cron configuration (base_url = https://cliptwo.in, idempotent
//     migration, cron URL built from app_settings at runtime, cron endpoint
//     auth/ingest ordering — static file checks, no network)
//
// SQL-side structural tests live in supabase/social-and-metrics-integration-tests.sql
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Test env (secrets here are fake fixtures, never real credentials).
process.env.SOCIAL_TOKEN_KEY =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.INSTAGRAM_CLIENT_ID = "ig-client-id";
process.env.INSTAGRAM_CLIENT_SECRET = "ig-client-secret";
process.env.YOUTUBE_CLIENT_ID = "yt-client-id";
process.env.YOUTUBE_CLIENT_SECRET = "yt-client-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";

import {
  encryptToken,
  decryptToken,
  isTokenExpired,
  isTokenExpiringSoon,
  tokenExpiresIn,
} from "../src/lib/token-crypto.ts";
import {
  getProvider,
  isProviderConfigured,
  validateOAuthState,
} from "../src/lib/social-providers.ts";
import {
  getMetricProvider,
  isMetricProviderConfigured,
  verifyMetricOwnership,
} from "../src/lib/metric-providers.ts";

// ── Harness ────────────────────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

const out = (line: string) => process.stdout.write(line + "\n");
const err = (line: string) => process.stderr.write(line + "\n");

// Silence provider diagnostics during the run — assertions check behavior.
console.log = () => {};
console.warn = () => {};
console.error = () => {};

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    out(`ok   - ${name}`);
  } catch (e) {
    failures.push(name);
    err(`FAIL - ${name}`);
    err(`     ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function rejects(
  fn: () => Promise<unknown>,
  re: RegExp,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (re.test(msg)) return;
    throw new Error(`expected error matching ${re}, got: ${msg}`);
  }
  throw new Error(`expected rejection matching ${re}, but resolved`);
}

// ── Fetch mock ─────────────────────────────────────────────────────────────

interface FetchCall {
  url: string;
  init?: RequestInit | undefined;
}

const fetchCalls: FetchCall[] = [];
type Handler = (
  url: string,
  init?: RequestInit | undefined,
) => Response | Promise<Response>;

let handler: Handler = () => {
  throw new Error("fetch called but no mock handler installed");
};

globalThis.fetch = (async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input);
  fetchCalls.push({ url, init });
  return handler(url, init);
}) as typeof fetch;

type Rule = [
  (url: string) => boolean,
  (url: string, init?: RequestInit | undefined) => Response,
];

function route(...rules: Rule[]): void {
  fetchCalls.length = 0;
  handler = (url, init) => {
    for (const [match, respond] of rules) {
      if (match(url)) return respond(url, init);
    }
    throw new Error(`Unhandled fetch in test: ${url.split("?")[0]}`);
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Repo file fixtures (static configuration checks, no network) ───────────

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readRepo = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

function sqlFilesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...sqlFilesUnder(rel));
    else if (entry.name.endsWith(".sql")) found.push(rel);
  }
  return found;
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── E/F: encrypted token storage primitives ──────────────────────────────
  await test("encrypt/decrypt roundtrip; ciphertext never contains plaintext", () => {
    const plain = "IG-long-lived-token-abc";
    const enc = encryptToken(plain);
    assert.notEqual(enc, plain);
    assert.ok(!enc.includes(plain), "ciphertext must not contain plaintext");
    assert.equal(decryptToken(enc), plain);
  });

  await test("decrypt fails with wrong key (tamper/misconfig detection)", () => {
    const enc = encryptToken("secret-token");
    const original = process.env.SOCIAL_TOKEN_KEY;
    process.env.SOCIAL_TOKEN_KEY = "ff".repeat(32);
    try {
      assert.throws(() => decryptToken(enc));
    } finally {
      process.env.SOCIAL_TOKEN_KEY = original;
    }
  });

  await test("tokenExpiresIn guards NaN/negative expires_in (no Invalid Date)", () => {
    assert.ok(Number.isFinite(tokenExpiresIn(NaN).getTime()));
    assert.ok(Number.isFinite(tokenExpiresIn(-5).getTime()));
    const ok = tokenExpiresIn(3600);
    assert.ok(Math.abs(ok.getTime() - (Date.now() + 3600 * 1000)) < 5000);
  });

  // ── P: expiry helpers / pre-expiry refresh window ────────────────────────
  await test("isTokenExpired / isTokenExpiringSoon semantics (fail-closed)", () => {
    assert.equal(isTokenExpired(null), false);
    assert.equal(isTokenExpired(new Date(Date.now() - 1000).toISOString()), true);
    assert.equal(isTokenExpired(new Date(Date.now() + 3600_000).toISOString()), false);
    assert.equal(isTokenExpired("not-a-date"), true);

    assert.equal(isTokenExpiringSoon(null), false);
    // 1h left → inside the 48h refresh window (Instagram must refresh pre-expiry)
    assert.equal(isTokenExpiringSoon(new Date(Date.now() + 3600_000).toISOString()), true);
    // 7d left → outside the window
    assert.equal(isTokenExpiringSoon(new Date(Date.now() + 7 * 86400_000).toISOString()), false);
    assert.equal(isTokenExpiringSoon(new Date(Date.now() - 1000).toISOString()), true);
    assert.equal(isTokenExpiringSoon("not-a-date"), true);
  });

  // ── C/D: OAuth state validation (CSRF) ───────────────────────────────────
  await test("validateOAuthState accepts valid state", () => {
    const now = Date.UTC(2026, 0, 1);
    assert.deepEqual(
      validateOAuthState(
        { platform: "Instagram", expires_at: new Date(now + 60_000).toISOString() },
        "Instagram",
        now,
      ),
      { ok: true },
    );
  });

  await test("validateOAuthState rejects missing state", () => {
    assert.deepEqual(
      validateOAuthState(null, "Instagram"),
      { ok: false, reason: "not_found" },
    );
  });

  await test("validateOAuthState rejects expired state", () => {
    const now = Date.UTC(2026, 0, 1);
    assert.deepEqual(
      validateOAuthState(
        { platform: "Instagram", expires_at: new Date(now - 1).toISOString() },
        "Instagram",
        now,
      ),
      { ok: false, reason: "expired" },
    );
  });

  await test("validateOAuthState rejects platform mismatch", () => {
    const now = Date.UTC(2026, 0, 1);
    assert.deepEqual(
      validateOAuthState(
        { platform: "YouTube", expires_at: new Date(now + 60_000).toISOString() },
        "Instagram",
        now,
      ),
      { ok: false, reason: "platform_mismatch" },
    );
  });

  await test("validateOAuthState rejects unparsable expiry (fail-closed)", () => {
    assert.deepEqual(
      validateOAuthState({ platform: "Instagram", expires_at: "garbage" }, "Instagram"),
      { ok: false, reason: "expired" },
    );
  });

  // ── Config gates (connection requires env) ───────────────────────────────
  await test("provider config gates report configured platforms", () => {
    assert.equal(isProviderConfigured("Instagram"), true);
    assert.equal(isProviderConfigured("YouTube"), true);
    assert.equal(isMetricProviderConfigured("Instagram"), true);
    assert.equal(isMetricProviderConfigured("YouTube"), true);
    assert.equal(isProviderConfigured("Kick"), false);
    assert.equal(isMetricProviderConfigured("Kick"), false);
  });

  // ── OAuth initiate: authorize URLs ───────────────────────────────────────
  await test("Instagram authorize URL: scopes, state, redirect, no secret", () => {
    const res = getProvider("Instagram").getAuthorizationUrl("user-1", "state-abc");
    assert.ok(res.authorizationUrl.startsWith("https://www.instagram.com/oauth/authorize?"));
    const p = new URL(res.authorizationUrl).searchParams;
    assert.equal(p.get("response_type"), "code");
    assert.equal(p.get("state"), "state-abc");
    assert.equal(p.get("enable_fb_login"), "0");
    assert.ok(p.get("scope")?.includes("instagram_business_basic"));
    assert.ok(p.get("scope")?.includes("instagram_business_manage_insights"));
    assert.equal(
      p.get("redirect_uri"),
      "https://app.example.test/api/social/oauth/callback/instagram",
    );
    assert.ok(!res.authorizationUrl.includes("client_secret"));
  });

  await test("YouTube authorize URL: PKCE + offline refresh + no secret", async () => {
    const provider = getProvider("YouTube");
    assert.ok(provider.getAuthorizationUrlAsync);
    const res = await provider.getAuthorizationUrlAsync("user-1", "state-yt");
    const p = new URL(res.authorizationUrl).searchParams;
    assert.equal(p.get("code_challenge_method"), "S256");
    assert.ok(p.get("code_challenge"));
    assert.equal(p.get("access_type"), "offline");
    assert.equal(p.get("prompt"), "consent");
    assert.equal(p.get("response_type"), "code");
    assert.ok(res.codeVerifier && res.codeVerifier.length > 40);
    assert.ok(!res.authorizationUrl.includes("client_secret"));
    assert.equal(
      p.get("redirect_uri"),
      "https://app.example.test/api/social/oauth/callback/youtube",
    );
  });

  // ── OAuth callback: code exchange chains ─────────────────────────────────
  await test("Instagram exchangeCode: short→long-lived → profile", async () => {
    route(
      [
        (u) => u.includes("api.instagram.com/oauth/access_token"),
        () => json({ access_token: "short-token", expires_in: 3600, scope: "instagram_business_basic" }),
      ],
      [
        (u) => u.includes("grant_type=ig_exchange_token"),
        () => json({ access_token: "long-token", expires_in: 5184000 }),
      ],
      [
        (u) => u.includes("graph.instagram.com/me"),
        () => json({ id: "12345", username: "testhandle" }),
      ],
    );
    const res = await getProvider("Instagram").exchangeCode("code-x", "state", undefined);
    assert.equal(res.accessToken, "long-token", "long-lived token preferred");
    assert.equal(res.providerAccountId, "12345");
    assert.equal(res.handle, "testhandle");
    assert.equal(res.refreshToken, null);
    assert.equal(res.expiresIn, 5184000);

    const tokenBody = String(fetchCalls[0].init?.body ?? "");
    assert.ok(tokenBody.includes("client_secret=ig-client-secret"));
    assert.ok(tokenBody.includes("code=code-x"));
    assert.ok(tokenBody.includes("grant_type=authorization_code"));
  });

  await test("YouTube exchangeCode: token + channel lookup with PKCE verifier", async () => {
    route(
      [
        (u) => u.includes("oauth2.googleapis.com/token"),
        () =>
          json({
            access_token: "yt-access",
            refresh_token: "yt-refresh",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/youtube.readonly",
          }),
      ],
      [
        (u) => u.includes("youtube/v3/channels"),
        () =>
          json({
            items: [
              {
                id: "UCabc123",
                snippet: { title: "My Channel", thumbnails: { default: { url: "https://x/y.png" } } },
              },
            ],
          }),
      ],
    );
    const res = await getProvider("YouTube").exchangeCode("yt-code", "state", "verifier-123");
    assert.equal(res.accessToken, "yt-access");
    assert.equal(res.refreshToken, "yt-refresh");
    assert.equal(res.providerAccountId, "UCabc123");
    assert.equal(res.handle, "My Channel");
    const body = String(fetchCalls[0].init?.body ?? "");
    assert.ok(body.includes("code_verifier=verifier-123"));
    assert.ok(body.includes("grant_type=authorization_code"));
  });

  // ── G/H: provider ownership verification ─────────────────────────────────
  await test("Instagram verifyOwnership: case-insensitive handle match", async () => {
    route([
      (u) => u.includes("graph.instagram.com/me"),
      () => json({ id: "123", username: "TestHandle" }),
    ]);
    const res = await getProvider("Instagram").verifyOwnership("tok", "testhandle");
    assert.equal(res.verified, true);
    assert.equal(res.providerAccountId, "123");
  });

  await test("Instagram verifyOwnership: handle mismatch rejected", async () => {
    route([
      (u) => u.includes("graph.instagram.com/me"),
      () => json({ id: "123", username: "someone_else" }),
    ]);
    const res = await getProvider("Instagram").verifyOwnership("tok", "testhandle");
    assert.equal(res.verified, false);
    assert.ok(res.error?.includes("testhandle"));
  });

  await test("YouTube verifyOwnership: title match / mismatch", async () => {
    route([
      (u) => u.includes("youtube/v3/channels"),
      () => json({ items: [{ id: "UCx", snippet: { title: "Chan" } }] }),
    ]);
    const ok = await getProvider("YouTube").verifyOwnership("tok", "Chan");
    assert.equal(ok.verified, true);
    assert.equal(ok.providerAccountId, "UCx");

    route([
      (u) => u.includes("youtube/v3/channels"),
      () => json({ items: [{ id: "UCx", snippet: { title: "Other" } }] }),
    ]);
    const bad = await getProvider("YouTube").verifyOwnership("tok", "Chan");
    assert.equal(bad.verified, false);
    assert.ok(bad.error?.includes("Chan"));
  });

  // ── P/Q: token refresh paths ─────────────────────────────────────────────
  await test("Instagram refreshToken hits ig_refresh_token endpoint", async () => {
    route([
      (u) => u.includes("refresh_access_token"),
      () => json({ access_token: "new-long", expires_in: 5184000 }),
    ]);
    const res = await getProvider("Instagram").refreshToken("old-long");
    assert.equal(res.accessToken, "new-long");
    assert.equal(res.refreshToken, null);
    assert.ok(fetchCalls[0].url.includes("grant_type=ig_refresh_token"));
    assert.ok(fetchCalls[0].url.includes("access_token=old-long"));
    assert.ok(!fetchCalls[0].url.includes("client_secret"));
  });

  await test("Instagram refreshToken failure throws (routes set connection_error)", async () => {
    route([
      (u) => u.includes("refresh_access_token"),
      () => json({ error: { message: "bad token" } }, 400),
    ]);
    await rejects(
      () => getProvider("Instagram").refreshToken("dead-long"),
      /Instagram token refresh failed/,
    );
  });

  await test("YouTube refreshToken success + failure (status in error)", async () => {
    route([
      (u) => u.includes("oauth2.googleapis.com/token"),
      () => json({ access_token: "a2", refresh_token: "r2", expires_in: 3600 }),
    ]);
    const ok = await getProvider("YouTube").refreshToken("r1");
    assert.equal(ok.accessToken, "a2");
    assert.equal(ok.refreshToken, "r2");
    const body = String(fetchCalls[0].init?.body ?? "");
    assert.ok(body.includes("grant_type=refresh_token"));

    route([
      (u) => u.includes("oauth2.googleapis.com/token"),
      () => json({ error: "invalid_grant" }, 400),
    ]);
    await rejects(
      () => getProvider("YouTube").refreshToken("r1"),
      /YouTube token refresh failed: HTTP 400/,
    );
  });

  // ── M/N: shared metric ownership helper (fail-closed) ────────────────────
  await test("verifyMetricOwnership: YouTube match / mismatch / missing", () => {
    assert.equal(
      verifyMetricOwnership({
        platform: "YouTube",
        metrics: { channelId: "UC1" },
        accountProviderId: "UC1",
        accountHandle: "Chan",
      }).ok,
      true,
    );
    const mismatch = verifyMetricOwnership({
      platform: "YouTube",
      metrics: { channelId: "UC2" },
      accountProviderId: "UC1",
      accountHandle: "Chan",
    });
    assert.equal(mismatch.ok, false);
    assert.ok(mismatch.error?.includes("does not belong"));
    assert.equal(
      verifyMetricOwnership({
        platform: "YouTube",
        metrics: { channelId: undefined },
        accountProviderId: "UC1",
        accountHandle: "Chan",
      }).ok,
      false,
    );
    assert.equal(
      verifyMetricOwnership({
        platform: "YouTube",
        metrics: { channelId: "UC1" },
        accountProviderId: null,
        accountHandle: "Chan",
      }).ok,
      false,
    );
  });

  await test("verifyMetricOwnership: Instagram match (case-insensitive) / mismatch", () => {
    assert.equal(
      verifyMetricOwnership({
        platform: "Instagram",
        metrics: { username: "Handle" },
        accountProviderId: "1",
        accountHandle: "handle",
      }).ok,
      true,
    );
    assert.equal(
      verifyMetricOwnership({
        platform: "Instagram",
        metrics: { username: "other" },
        accountProviderId: "1",
        accountHandle: "handle",
      }).ok,
      false,
    );
    assert.equal(
      verifyMetricOwnership({
        platform: "Instagram",
        metrics: { username: undefined },
        accountProviderId: "1",
        accountHandle: "handle",
      }).ok,
      false,
    );
  });

  // ── I: Instagram shortcode extraction + media resolution ─────────────────
  const igMetric = getMetricProvider("Instagram");

  await test("Instagram: invalid URL throws before any API call", async () => {
    fetchCalls.length = 0;
    await rejects(
      () =>
        igMetric.fetchMetrics(
          "https://example.com/not-a-post",
          "tok",
          "acc1",
        ),
      /Could not extract a valid shortcode/,
    );
    assert.equal(fetchCalls.length, 0, "no fetch must happen pre-extraction");
  });

  await test("Instagram: reel/p/tv shortcodes extract (fails without account id)", async () => {
    fetchCalls.length = 0;
    for (const path of ["reel/AAA111", "p/BBB222", "tv/CCC333"]) {
      await rejects(
        () => igMetric.fetchMetrics(`https://www.instagram.com/${path}/`, "tok"),
        /requires an account identifier/,
      );
    }
    assert.equal(fetchCalls.length, 0, "unresolvable without account id — no fetch");
  });

  await test("Instagram happy path: resolve → media (engagement fields) → insights", async () => {
    route(
      [
        (u) => u.includes("/acc1/media") && u.includes("shortcode"),
        () =>
          json({
            data: [
              { id: "999", shortcode: "XYZ789", username: "myhandle", media_type: "REELS" },
            ],
          }),
      ],
      [
        (u) => u.includes("graph.instagram.com/999?"),
        () =>
          json({
            id: "999",
            media_type: "REELS",
            media_product_type: "REELS",
            username: "myhandle",
            caption: "hi",
            permalink: "https://www.instagram.com/reel/XYZ789/",
            like_count: 42,
            comments_count: 7,
            shares: { count: 3 },
          }),
      ],
      [
        (u) => u.includes("/999/insights"),
        () => json({ data: [{ name: "views", values: [{ value: 1234 }] }] }),
      ],
    );
    const m = await igMetric.fetchMetrics(
      "https://www.instagram.com/reel/XYZ789/",
      "tok",
      "acc1",
    );
    assert.equal(m.views, 1234);
    assert.equal(m.likes, 42, "like_count must be requested and parsed");
    assert.equal(m.comments, 7, "comments_count must be requested and parsed");
    assert.equal(m.shares, 3, "shares must be requested and parsed");
    assert.equal(m.username, "myhandle");
    assert.equal(m.verificationStatus, "verified");
    assert.equal(m.source, "platform_api");

    const mediaCall = fetchCalls.find((c) => c.url.includes("graph.instagram.com/999?"));
    assert.ok(mediaCall, "media lookup must happen");
    assert.ok(mediaCall.url.includes("like_count"), "media fields must request like_count");
    assert.ok(mediaCall.url.includes("comments_count"));
    assert.ok(mediaCall.url.includes("shares"));
  });

  await test("Instagram: shares field rejected → falls back, likes still fetched", async () => {
    let mediaCalls = 0;
    route(
      [
        (u) => u.includes("/acc1/media") && u.includes("shortcode"),
        () =>
          json({ data: [{ id: "777", shortcode: "FALL1", username: "h", media_type: "REELS" }] }),
      ],
      [
        (u) => u.includes("graph.instagram.com/777?"),
        () => {
          mediaCalls++;
          if (mediaCalls === 1) {
            return json({ error: { message: "(#100) Field shares unsupported" } }, 400);
          }
          return json({
            id: "777",
            media_type: "REELS",
            username: "h",
            like_count: 5,
            comments_count: 1,
          });
        },
      ],
      [
        (u) => u.includes("/777/insights"),
        () => json({ data: [{ name: "views", values: [{ value: 10 }] }] }),
      ],
    );
    const m = await igMetric.fetchMetrics(
      "https://www.instagram.com/reel/FALL1/",
      "tok",
      "acc1",
    );
    assert.equal(mediaCalls, 2, "must retry with reduced field tier");
    assert.equal(m.likes, 5, "reduced tier must still include like_count");
    assert.equal(m.shares, 0);
    assert.equal(m.views, 10);
    assert.equal(m.verificationStatus, "verified");

    const mediaAttempts = fetchCalls.filter((c) => c.url.includes("graph.instagram.com/777?"));
    assert.ok(mediaAttempts[0].url.includes("shares"), "tier 1 requests shares");
    assert.ok(!mediaAttempts[1].url.includes("shares"), "tier 2 drops shares");
    assert.ok(mediaAttempts[1].url.includes("like_count"), "tier 2 keeps like_count");
  });

  await test("Instagram: all media field tiers failing → throws (no fabricated metrics)", async () => {
    route(
      [
        (u) => u.includes("/acc1/media") && u.includes("shortcode"),
        () => json({ data: [{ id: "666", shortcode: "DEAD1", username: "h" }] }),
      ],
      [
        (u) => u.includes("graph.instagram.com/666?"),
        () => json({ error: { message: "rate limited" } }, 400),
      ],
    );
    await rejects(
      () => igMetric.fetchMetrics("https://www.instagram.com/reel/DEAD1/", "tok", "acc1"),
      /Instagram media fetch failed/,
    );
  });

  await test("Instagram: unresolved shortcode fails closed with diagnostic", async () => {
    route([
      (u) => u.includes("/acc1/media") && u.includes("shortcode"),
      () => json({ data: [] }),
    ]);
    await rejects(
      () => igMetric.fetchMetrics("https://www.instagram.com/reel/NOPE99/", "tok", "acc1"),
      /Could not resolve Instagram shortcode/,
    );
  });

  // ── K: insights fail-closed semantics ────────────────────────────────────
  async function igWithInsights(
    insights: (url: string, init?: RequestInit | undefined) => Response,
  ) {
    route(
      [
        (u) => u.includes("/acc1/media") && u.includes("shortcode"),
        () => json({ data: [{ id: "555", shortcode: "OK001", username: "h" }] }),
      ],
      [
        (u) => u.includes("graph.instagram.com/555?"),
        () =>
          json({
            id: "555",
            media_type: "REELS",
            username: "h",
            like_count: 3,
            comments_count: 1,
          }),
      ],
      [(u) => u.includes("/555/insights"), insights],
    );
    return igMetric.fetchMetrics("https://www.instagram.com/reel/OK001/", "tok", "acc1");
  }

  await test("Instagram insights: genuine 0 → verified (counts as real value)", async () => {
    const m = await igWithInsights(() =>
      json({ data: [{ name: "views", values: [{ value: 0 }] }] }),
    );
    assert.equal(m.views, 0);
    assert.equal(m.verificationStatus, "verified");
  });

  await test("Instagram insights: error 100 (metric unsupported) → NOT verified (fail-closed)", async () => {
    const m = await igWithInsights(() =>
      json({ error: { message: "(#100) Field invalid", code: 100 } }, 400),
    );
    assert.equal(m.views, 0);
    assert.equal(m.verificationStatus, "failed", "unavailable insights must not be verified-0");
  });

  await test("Instagram insights: HTTP 200 missing views metric → NOT verified", async () => {
    const m = await igWithInsights(() => json({ data: [] }));
    assert.equal(m.views, 0);
    assert.equal(m.verificationStatus, "failed");
  });

  await test("Instagram insights: network error → NOT verified", async () => {
    const m = await igWithInsights(() => {
      throw new TypeError("fetch failed");
    });
    assert.equal(m.verificationStatus, "failed");
  });

  await test("Instagram insights: generic API failure → NOT verified", async () => {
    const m = await igWithInsights(() => json({ error: { message: "boom" } }, 500));
    assert.equal(m.verificationStatus, "failed");
  });

  // ── J/L: YouTube video ID extraction + fail-closed API errors ────────────
  const ytMetric = getMetricProvider("YouTube");
  const YT_ID = "dQw4w9WgXcQ"; // 11 chars

  await test("YouTube: watch / youtu.be / shorts / embed / live URLs extract ID", async () => {
    route([
      (u) => u.includes("youtube/v3/videos"),
      () =>
        json({
          items: [
            {
              id: YT_ID,
              statistics: { viewCount: "100", likeCount: "5", commentCount: "2" },
              snippet: { channelId: "UCmatch" },
            },
          ],
        }),
    ]);
    const variants = [
      `https://www.youtube.com/watch?v=${YT_ID}`,
      `https://youtu.be/${YT_ID}`,
      `https://www.youtube.com/shorts/${YT_ID}`,
      `https://www.youtube.com/embed/${YT_ID}`,
      `https://www.youtube.com/live/${YT_ID}`,
    ];
    for (const u of variants) {
      fetchCalls.length = 0;
      const m = await ytMetric.fetchMetrics(u, "tok");
      assert.equal(m.views, 100);
      assert.equal(m.channelId, "UCmatch");
      assert.equal(m.verificationStatus, "verified");
      assert.ok(
        fetchCalls[0]?.url.includes(`id=${YT_ID}`),
        `must call videos.list with extracted id for ${u}`,
      );
    }
  });

  await test("YouTube: invalid URL throws (no API call)", async () => {
    await rejects(
      () => ytMetric.fetchMetrics("https://example.com/nope", "tok"),
      /Could not extract video ID/,
    );
  });

  await test("YouTube: API failure throws — never fabricates zero metrics", async () => {
    route([
      (u) => u.includes("youtube/v3/videos"),
      () => json({ error: { message: "quotaExceeded" } }, 400),
    ]);
    await rejects(
      () => ytMetric.fetchMetrics(`https://www.youtube.com/watch?v=${YT_ID}`, "tok"),
      /YouTube metrics fetch failed: HTTP 400/,
    );
  });

  await test("YouTube: private/deleted video throws", async () => {
    route([
      (u) => u.includes("youtube/v3/videos"),
      () => json({ items: [] }),
    ]);
    await rejects(
      () => ytMetric.fetchMetrics(`https://www.youtube.com/watch?v=${YT_ID}`, "tok"),
      /private\/deleted/,
    );
  });

  await test("YouTube fetchAccountMetrics: implemented, bounded, ownership-filtered", async () => {
    route(
      [
        (u) => u.includes("youtube/v3/channels?part=contentDetails"),
        () =>
          json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "UUlist" } } }] }),
      ],
      [
        (u) => u.includes("playlistItems"),
        () =>
          json({
            items: [
              { contentDetails: { videoId: "aaaaaaaaaaa" } },
              { contentDetails: { videoId: "bbbbbbbbbbb" } },
            ],
          }),
      ],
      [
        (u) => u.includes("youtube/v3/videos"),
        () =>
          json({
            items: [
              {
                id: "aaaaaaaaaaa",
                statistics: { viewCount: "10", likeCount: "1", commentCount: "0" },
                snippet: { channelId: "UCmine" },
              },
              {
                id: "bbbbbbbbbbb",
                statistics: { viewCount: "99" },
                snippet: { channelId: "UCother" },
              },
            ],
          }),
      ],
    );
    const results = await ytMetric.fetchAccountMetrics("UCmine", "tok");
    assert.equal(results.length, 1, "foreign-channel videos must be filtered out");
    assert.equal(results[0].postUrl, `https://www.youtube.com/watch?v=aaaaaaaaaaa`);
    assert.equal(results[0].metrics.views, 10);
    assert.equal(results[0].metrics.channelId, "UCmine");
    assert.equal(results[0].metrics.verificationStatus, "verified");
  });

  await test("Instagram fetchAccountMetrics: pages account media and fetches metrics", async () => {
    route(
      [
        (u) => u.includes("/acc9/media"),
        () =>
          json({
            data: [{ id: "998", permalink: "https://www.instagram.com/reel/ZZZ/" }],
          }),
      ],
      [
        (u) => u.includes("graph.instagram.com/998?"),
        () =>
          json({
            id: "998",
            media_type: "REELS",
            username: "h",
            like_count: 1,
            comments_count: 0,
          }),
      ],
      [
        (u) => u.includes("/998/insights"),
        () => json({ data: [{ name: "views", values: [{ value: 5 }] }] }),
      ],
    );
    const results = await igMetric.fetchAccountMetrics("acc9", "tok");
    assert.equal(results.length, 1);
    assert.equal(results[0].metrics.views, 5);
    assert.equal(results[0].metrics.verificationStatus, "verified");
    assert.ok(results[0].postUrl.includes("instagram.com/reel/ZZZ/"));
  });

  // ── Production cron configuration (base_url regression) ──────────────────
  await test("migration 000009 upserts base_url to https://cliptwo.in (cron_secret untouched)", () => {
    const sql = readRepo("supabase/migrations/20250101000009_production_cron_base_url.sql");
    assert.ok(sql.includes("VALUES ('base_url', 'https://cliptwo.in')"), "must upsert production domain");
    assert.ok(sql.includes("ON CONFLICT (key) DO UPDATE"), "must be an idempotent upsert");
    assert.ok(!sql.includes("DO NOTHING"), "existing base_url row must be updated, not skipped");
    assert.ok(!sql.includes("('cron_secret'"), "must never insert/replace the cron_secret value");
  });

  await test("auto-metrics-sync.sql: executable seed targets https://cliptwo.in", () => {
    const sql = readRepo("supabase/auto-metrics-sync.sql");
    assert.ok(sql.includes("('base_url', 'https://cliptwo.in')"), "seed default must be production domain");
    assert.ok(!sql.includes("cliptwo.vercel.app"), "no retired domain anywhere in cron SQL");
    assert.ok(!sql.includes("SELECT * FROM app_settings"), "must not print cron_secret when run");
  });

  await test("fix-cron-secrets.sql: production URL + cron_secret never printed", () => {
    const sql = readRepo("supabase/fix-cron-secrets.sql");
    assert.ok(sql.includes("https://cliptwo.in"), "setup comments must show production domain");
    assert.ok(!sql.includes("cliptwo.vercel.app"), "no retired domain in lock setup SQL");
    assert.ok(!sql.includes("SELECT * FROM app_settings"), "verify query must hide cron_secret");
    assert.ok(sql.includes("CASE WHEN key = 'cron_secret'"), "secret masking must be explicit");
  });

  await test("no SQL seed/example left on retired cliptwo.vercel.app host", () => {
    const files = sqlFilesUnder("supabase");
    assert.ok(files.length > 10, `expected many supabase SQL files, got ${files.length}`);
    const offenders = files.filter((f) => readRepo(f).includes("'https://cliptwo.vercel.app'"));
    assert.deepEqual(offenders, [], `retired quoted URL still present in: ${offenders.join(", ")}`);
  });

  await test("cron job SQL builds URL from app_settings at runtime (no reschedule needed)", () => {
    const sql = readRepo("supabase/auto-metrics-sync.sql");
    assert.ok(
      sql.includes("FROM public.app_settings WHERE key = 'base_url') || '/api/metrics/sync/cron'"),
      "job body must compose URL from base_url per run",
    );
    assert.ok(sql.includes("'*/30 * * * *'"), "schedule must stay every 30 minutes");
    assert.ok(sql.includes("'auto-metrics-sync'"), "job name must stay stable");
    assert.ok(sql.includes("|| (SELECT value FROM public.app_settings WHERE key = 'cron_secret')"), "auth header must read cron_secret at runtime");
  });

  await test("cron endpoint: Bearer CRON_SECRET, approved-only, verified account, ingest before last_sync_at", () => {
    const route = readRepo("src/app/api/metrics/sync/cron/route.ts");
    assert.ok(route.includes("process.env.CRON_SECRET"), "CRON_SECRET env must gate auth");
    assert.ok(route.includes("timingSafeEqual"), "constant-time secret compare required");
    assert.ok(route.includes('.eq("status", "approved")'), "must only process approved clips");
    assert.ok(route.includes('rpc("ingest_clip_metrics"'), "must persist via ingest_clip_metrics RPC");
    assert.ok(route.includes('verificationStatus !== "verified"'), "must skip non-verified metrics (fail-closed)");
    assert.ok(route.includes("socialAccount.verified"), "must gate on an ownership-verified account");
    assert.ok(route.includes('socialAccount.status !== "connected"'), "must gate on connected status");
    const ingestAt = route.indexOf('rpc("ingest_clip_metrics"');
    const syncAt = route.indexOf("last_sync_at");
    assert.ok(ingestAt !== -1 && syncAt > ingestAt, "last_sync_at must be written only after successful ingest");
  });

  await test("SQL suite covers production base_url + cron job (tests 36-40)", () => {
    const sql = readRepo("supabase/social-and-metrics-integration-tests.sql");
    assert.ok(sql.includes("'app_settings base_url is exactly https://cliptwo.in'"));
    assert.ok(sql.includes("'cron job auto-metrics-sync scheduled and active'"));
    assert.ok(sql.includes("to_regclass('cron.job') IS NULL"), "must degrade gracefully without pg_cron");
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  out("");
  out(`${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const f of failures) err(`  failed: ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  err(`Test harness crashed: ${e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});
