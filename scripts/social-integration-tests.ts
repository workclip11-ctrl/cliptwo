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
//   - Sanitized Instagram insights diagnostics (allowlisted classification:
//     metric_missing_in_response / media_posted_before_business_conversion /
//     metric_not_supported_for_media_type / api_error_<status> / network_error;
//     never tokens, raw provider text, or response bodies)
//   - Production-ready Cashfree configuration (environment-driven base URL,
//     fail-closed validation, server-authoritative SDK mode, no hardcoded
//     sandbox) + static payment-security regression checks
//   - Auth/OAuth production audits (Supabase Google + PKCE, env-driven
//     Instagram/YouTube callbacks, no legacy host references)
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
import {
  resolveCashfreeEnvironment,
  getCashfreeConfig,
  CASHFREE_API_VERSION,
} from "../src/lib/cashfree.ts";

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

function filesUnder(dir: string, exts: string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...filesUnder(rel, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) found.push(rel);
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
    token = "tok",
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
    return igMetric.fetchMetrics("https://www.instagram.com/reel/OK001/", token, "acc1");
  }

  // Allowlisted diagnostic categories — the ONLY permitted values.
  const INSIGHTS_DIAG_RE =
    /^(metric_missing_in_response|media_posted_before_business_conversion|metric_not_supported_for_media_type|api_error_[0-9]{3}|network_error)$/;

  await test("Instagram insights A: genuine 0 → verified (counts as real value)", async () => {
    const m = await igWithInsights(() =>
      json({ data: [{ name: "views", values: [{ value: 0 }] }] }),
    );
    assert.equal(m.views, 0);
    assert.equal(m.verificationStatus, "verified");
    assert.equal(m.insightsError, undefined, "verified result must carry no diagnostic");
  });

  await test("Instagram insights A: valid views → verified, insightsError undefined", async () => {
    const m = await igWithInsights(() =>
      json({ data: [{ name: "views", values: [{ value: 42 }] }] }),
    );
    assert.equal(m.views, 42);
    assert.equal(m.verificationStatus, "verified");
    assert.equal(m.insightsError, undefined, "verified result must carry no diagnostic");
    assert.ok(
      !JSON.stringify(m).includes("insightsError"),
      "serialized verified result must not include a diagnostic field",
    );
  });

  await test("Instagram insights C: error 100 (metric unsupported) → NOT verified (fail-closed)", async () => {
    const m = await igWithInsights(() =>
      json({ error: { message: "(#100) Field invalid", code: 100 } }, 400),
    );
    assert.equal(m.views, 0);
    assert.equal(m.verificationStatus, "failed", "unavailable insights must not be verified-0");
    assert.equal(m.insightsError, "metric_not_supported_for_media_type");
    assert.match(String(m.insightsError), INSIGHTS_DIAG_RE);
  });

  await test("Instagram insights B: HTTP 200 missing views metric → NOT verified", async () => {
    const m = await igWithInsights(() => json({ data: [] }));
    assert.equal(m.views, 0);
    assert.equal(m.verificationStatus, "failed");
    assert.equal(m.insightsError, "metric_missing_in_response");
    assert.match(String(m.insightsError), INSIGHTS_DIAG_RE);
  });

  await test("Instagram insights D: posted before business conversion → failed + classified", async () => {
    const m = await igWithInsights(() =>
      json(
        {
          error: {
            message:
              "(#100) Media cannot be retrieved because it was posted before this account was converted to a Business account",
            code: 100,
          },
        },
        400,
      ),
    );
    assert.equal(m.views, 0, "never fabricate views for unavailable insights");
    assert.equal(m.verificationStatus, "failed");
    assert.equal(m.insightsError, "media_posted_before_business_conversion");
    assert.match(String(m.insightsError), INSIGHTS_DIAG_RE);
    assert.ok(!String(m.insightsError).includes("account"), "raw Meta message must not leak");
  });

  await test("Instagram insights E: arbitrary Meta error → failed + api_error_<status>", async () => {
    const m = await igWithInsights(() =>
      json(
        { error: { message: "Invalid OAuth access token string", code: 190 } },
        401,
      ),
    );
    assert.equal(m.views, 0);
    assert.equal(m.verificationStatus, "failed");
    assert.equal(m.insightsError, "api_error_401");
    assert.match(String(m.insightsError), INSIGHTS_DIAG_RE);
    assert.ok(!String(m.insightsError).includes("OAuth"), "raw Meta message must not leak");
  });

  await test("Instagram insights F: network error → failed + network_error", async () => {
    const m = await igWithInsights(() => {
      throw new TypeError("fetch failed");
    });
    assert.equal(m.verificationStatus, "failed");
    assert.equal(m.insightsError, "network_error");
    assert.match(String(m.insightsError), INSIGHTS_DIAG_RE);
    assert.ok(!String(m.insightsError).includes("fetch"), "raw error text must not leak");
  });

  await test("Instagram insights: generic API failure → NOT verified", async () => {
    const m = await igWithInsights(() => json({ error: { message: "boom" } }, 500));
    assert.equal(m.verificationStatus, "failed");
    assert.equal(m.insightsError, "api_error_500");
  });

  await test("Instagram insights G: no token/secret can appear in diagnostic or result", async () => {
    const SECRET_TOKEN = "IGPRD-SECRET-TOKEN-XYZ-0123456789";
    const scenarios: Array<{
      name: string;
      insights: () => Response;
      expected: RegExp;
    }> = [
      { name: "missing_views", insights: () => json({ data: [] }), expected: /^metric_missing_in_response$/ },
      {
        name: "before_conversion",
        insights: () =>
          json(
            { error: { message: "Posted before business conversion", code: 100 } },
            400,
          ),
        expected: /^media_posted_before_business_conversion$/,
      },
      {
        name: "error_100",
        insights: () => json({ error: { message: "(#100) Field invalid", code: 100 } }, 400),
        expected: /^metric_not_supported_for_media_type$/,
      },
      {
        name: "api_error_403",
        insights: () =>
          json({ error: { message: "Forbidden secret client_secret value", code: 200 } }, 403),
        expected: /^api_error_403$/,
      },
      {
        name: "network_error",
        insights: () => { throw new TypeError("fetch failed"); },
        expected: /^network_error$/,
      },
    ];

    for (const s of scenarios) {
      const m = await igWithInsights(s.insights, SECRET_TOKEN);
      assert.equal(m.verificationStatus, "failed", `${s.name}: must stay fail-closed`);
      assert.ok(m.insightsError, `${s.name}: diagnostic required`);
      assert.match(m.insightsError, s.expected, `${s.name}: must match allowlist`);

      // The serialized result (what routes return to callers) must never
      // contain credentials of any kind.
      const serialized = JSON.stringify(m);
      assert.ok(!serialized.includes(SECRET_TOKEN), `${s.name}: access token leaked`);
      assert.ok(!serialized.includes("access_token"), `${s.name}: access_token leaked`);
      assert.ok(!serialized.includes("client_secret"), `${s.name}: client_secret leaked`);
      assert.ok(!serialized.includes("Bearer"), `${s.name}: auth header leaked`);
      assert.ok(!serialized.includes("IGPRD-"), `${s.name}: token fragment leaked`);
    }
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

  // ── Cashfree production configuration (environment-driven, fail-closed) ──
  await test("CASHFREE_ENVIRONMENT resolves explicitly; sandbox never implicit", () => {
    assert.equal(resolveCashfreeEnvironment("production", "development"), "production");
    assert.equal(resolveCashfreeEnvironment("  Production ", "development"), "production");
    assert.equal(resolveCashfreeEnvironment("sandbox", "development"), "sandbox");
    assert.equal(resolveCashfreeEnvironment(undefined, "development"), null, "unset must fail closed");
    assert.equal(resolveCashfreeEnvironment("", "development"), null);
    assert.equal(resolveCashfreeEnvironment("prod", "development"), null, "typos must fail closed");
    assert.equal(
      resolveCashfreeEnvironment("Sandbox", "production"),
      null,
      "sandbox must be rejected in production builds",
    );
    assert.equal(resolveCashfreeEnvironment("production", "production"), "production");
    assert.equal(resolveCashfreeEnvironment(undefined, "production"), null, "unset in production fails closed");
  });

  await test("getCashfreeConfig: environment-driven base URL, fails closed on any gap", () => {
    const full = { CASHFREE_APP_ID: "test-app-id", CASHFREE_SECRET_KEY: "test-secret" } as NodeJS.ProcessEnv;

    const prod = getCashfreeConfig({ ...full, NODE_ENV: "production", CASHFREE_ENVIRONMENT: "production" });
    assert.equal(prod?.baseUrl, "https://api.cashfree.com/pg");
    assert.equal(prod?.environment, "production");

    const dev = getCashfreeConfig({ ...full, NODE_ENV: "development", CASHFREE_ENVIRONMENT: "sandbox" });
    assert.equal(dev?.baseUrl, "https://sandbox.cashfree.com/pg");
    assert.equal(dev?.environment, "sandbox");

    // Production build + explicit sandbox → null (never silent sandbox)
    assert.equal(
      getCashfreeConfig({ ...full, NODE_ENV: "production", CASHFREE_ENVIRONMENT: "sandbox" }),
      null,
    );
    // Missing/invalid environment → null
    assert.equal(getCashfreeConfig({ ...full, NODE_ENV: "production" }), null);
    assert.equal(getCashfreeConfig({ ...full, NODE_ENV: "production", CASHFREE_ENVIRONMENT: "staging" }), null);
    // Missing credentials → null
    assert.equal(
      getCashfreeConfig({ NODE_ENV: "production", CASHFREE_ENVIRONMENT: "production", CASHFREE_APP_ID: "i" }),
      null,
    );
    assert.equal(
      getCashfreeConfig({ NODE_ENV: "production", CASHFREE_ENVIRONMENT: "production" }),
      null,
    );
    assert.equal(CASHFREE_API_VERSION, "2025-01-01", "API version must stay pinned");
  });

  await test("Cashfree routes are environment-driven (no hardcoded base URL)", () => {
    const routes = [
      "src/app/api/campaigns/payment/cashfree/create-order/route.ts",
      "src/app/api/campaigns/payment/cashfree/webhook/route.ts",
    ];
    for (const f of routes) {
      const src = readRepo(f);
      assert.ok(!src.includes("sandbox.cashfree.com"), `${f}: must not hardcode sandbox URL`);
      assert.ok(!src.includes("https://api.cashfree.com"), `${f}: base URL must come from lib/cashfree`);
      assert.ok(src.includes("getCashfreeConfig()"), `${f}: must use env-driven config`);
      assert.ok(src.includes("CASHFREE_API_VERSION"), `${f}: must pin API version`);
    }
  });

  await test("sandbox.cashfree.com appears only in lib/cashfree.ts (src-wide)", () => {
    const files = filesUnder("src", [".ts", ".tsx"]);
    assert.ok(files.length > 20, `expected many src files, got ${files.length}`);
    const offenders = files.filter((f) => readRepo(f).includes("sandbox.cashfree.com"));
    assert.deepEqual(
      offenders,
      ["src/lib/cashfree.ts"],
      `sandbox URL must only exist in the config module, found: ${offenders.join(", ")}`,
    );
  });

  await test("create-order returns server-authoritative environment; frontend uses it", () => {
    const createOrder = readRepo("src/app/api/campaigns/payment/cashfree/create-order/route.ts");
    assert.ok(createOrder.includes("environment,"), "create-order must include environment in responses");
    assert.ok(createOrder.includes("status: 503"), "create-order must fail closed with 503 when misconfigured");

    const frontends = [
      "src/components/LaunchPaymentModal.tsx",
      "src/app/creator/campaigns/new/page.tsx",
    ];
    for (const f of frontends) {
      const src = readRepo(f);
      assert.ok(!src.includes('mode: "sandbox"'), `${f}: hardcoded sandbox mode must be gone`);
      assert.ok(src.includes("data.environment"), `${f}: SDK mode must come from server response`);
      assert.ok(
        src.includes('mode !== "production" && mode !== "sandbox"'),
        `${f}: invalid environment must fail closed`,
      );
    }
  });

  await test("webhook keeps authoritative verification and fails closed on bad config", () => {
    const src = readRepo("src/app/api/campaigns/payment/cashfree/webhook/route.ts");
    assert.ok(src.includes("getCashfreeConfig()"), "webhook must use env-driven config");
    assert.ok(src.includes("Configuration error"), "webhook must reject when misconfigured");
    assert.ok(src.includes("status: 500"), "misconfigured webhook must not process");
    assert.ok(src.includes("x-webhook-signature"), "signature header verification");
    assert.ok(src.includes("x-webhook-timestamp"), "timestamp header verification");
    assert.ok(src.includes("timingSafeEqual"), "constant-time signature compare");
    assert.ok(src.includes("isTimestampFresh"), "signature freshness window");
    assert.ok(src.includes('order_status !== "PAID"'), "authoritative PAID check");
    assert.ok(src.includes('payment_currency !== "INR"'), "INR currency check");
    assert.ok(src.includes("verify_cashfree_webhook"), "atomic verification RPC");
  });

  await test("payment security controls unchanged (static regression)", () => {
    const createOrder = readRepo("src/app/api/campaigns/payment/cashfree/create-order/route.ts");
    assert.ok(createOrder.includes('campaign.status !== "draft"'), "orders only for draft campaigns");
    assert.ok(createOrder.includes('profile.role !== "creator"'), "creator-only order creation");
    assert.ok(createOrder.includes('.eq("created_by", user.id)'), "campaign ownership validation");
    assert.ok(createOrder.includes("* 0.1"), "10% platform fee preserved");
    assert.ok(createOrder.includes('order_currency: "INR"'), "INR currency");
    assert.ok(createOrder.includes("x-idempotency-key"), "idempotency key preserved");
    assert.ok(createOrder.includes("reserve_cashfree_payment_attempt"), "reservation RPC preserved");
    assert.ok(createOrder.includes("release_cashfree_payment_reservation"), "reservation release preserved");
    assert.ok(createOrder.includes("normalizeIndianPhone"), "phone validation preserved");
  });

  await test("auth audit: Supabase Google OAuth with PKCE, no hardcoded Google endpoints", () => {
    const auth = readRepo("src/lib/auth.tsx");
    assert.ok(auth.includes('provider: "google"'), "must use Supabase signInWithOAuth Google");
    assert.ok(auth.includes("signInWithOAuth"), "must use Supabase Auth, not custom OAuth");
    assert.ok(!auth.includes("accounts.google.com"), "no hardcoded Google OAuth endpoints");
    const client = readRepo("src/lib/supabase/client.ts");
    assert.ok(client.includes('flowType: "pkce"'), "PKCE flow required");
    const callback = readRepo("src/app/auth/callback/route.ts");
    assert.ok(callback.includes("intent"), "OAuth onboarding intent handoff preserved");
  });

  await test("social OAuth: env-driven callbacks, no retired host, prod fail-closed", () => {
    const src = readRepo("src/lib/social-providers.ts");
    assert.ok(!src.includes("cliptwo.vercel.app"), "no retired host reference");
    assert.ok(src.includes("https://cliptwo.in"), "error guidance must point at production domain");
    assert.ok(
      src.includes('process.env.NODE_ENV === "production"'),
      "must throw in production when NEXT_PUBLIC_APP_URL is unset (no localhost fallback)",
    );
    assert.ok(
      src.includes("http://localhost:3000/api/social/oauth/callback/instagram"),
      "localhost fallback must remain development-only",
    );
  });

  await test("no mock/manual metric source is produced by app code (earnings integrity)", () => {
    const files = filesUnder("src", [".ts", ".tsx"]);
    const offenders = files.filter((f) =>
      /source:\s*["'](mock|manual|admin_override)["']/.test(readRepo(f)),
    );
    assert.deepEqual(offenders, [], `non-platform metric source produced in: ${offenders.join(", ")}`);
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

  // ── Insights diagnostic propagation (routes + source hygiene) ────────────
  await test("all sync routes keep fail-closed wording and expose sanitized diagnostic", () => {
    const routes = [
      "src/app/api/metrics/sync/route.ts",
      "src/app/api/metrics/sync/cron/route.ts",
      "src/app/api/metrics/sync/admin-trigger/route.ts",
    ];
    for (const f of routes) {
      const src = readRepo(f);
      assert.ok(src.includes('verificationStatus !== "verified"'), `${f}: must stay fail-closed`);
      assert.ok(src.includes("Insights unavailable (status:"), `${f}: generic wording must remain`);
      assert.ok(
        src.includes("diagnostic: metrics.insightsError"),
        `${f}: must expose the sanitized diagnostic on skip`,
      );
    }
  });

  await test("provider insightsError is allowlisted classification only (no raw provider text)", () => {
    const src = readRepo("src/lib/metric-providers.ts");
    assert.ok(src.includes("insightsError?: string"), "FetchedMetrics must expose insightsError");
    assert.ok(
      src.includes("insightsError = `api_error_${insightsRes.status}`"),
      "api_error classification must be HTTP-status-only",
    );
    assert.ok(
      src.includes('insightsError = "network_error"'),
      "network_error classification must be bare (no message)",
    );
    assert.ok(
      !src.includes("api_error_${insightsRes.status}: ${errMsg}"),
      "raw Meta error message must never reach insightsError",
    );
    assert.ok(
      !src.includes("`network_error: ${"),
      "raw network error text must never reach insightsError",
    );
    assert.ok(
      !src.includes("_insightsErrorReason = `api_error_"),
      "legacy reason variable must not reintroduce raw messages",
    );
  });

  // ── ingest_clip_metrics authorization hardening (migration 000010) ────────
  await test("migration 000010 exists and locks ingest_clip_metrics ACL to service_role", () => {
    const sql = readRepo("supabase/migrations/20250101000010_harden_ingest_clip_metrics.sql");
    assert.ok(
      sql.includes("create or replace function public.ingest_clip_metrics"),
      "must ship the authoritative definition",
    );
    for (const role of ["public", "anon", "authenticated"]) {
      assert.ok(
        sql.includes(
          `revoke execute on function public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) from ${role};`,
        ),
        `must REVOKE EXECUTE from ${role} in a numbered migration`,
      );
    }
    assert.ok(
      sql.includes(
        "grant execute on function public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) to service_role;",
      ),
      "service_role must retain EXECUTE (trusted sync/cron/admin-trigger pipeline)",
    );
    assert.ok(
      !/grant\s+execute\s+on\s+function\s+public\.ingest_clip_metrics[^;]*\bto\s+(anon|authenticated|public)\b/i.test(sql),
      "must never grant ingest back to anon/authenticated/public",
    );
    assert.ok(
      !sql.includes("CRON_SECRET") && !sql.includes("cron_secret") && !sql.includes("SERVICE_ROLE_KEY"),
      "must not reference any secret material",
    );
  });

  await test("ingest internal authorization: service_role-or-direct only, platform_api-only backend", () => {
    const sql = readRepo("supabase/migrations/20250101000010_harden_ingest_clip_metrics.sql");
    assert.ok(sql.includes("current_setting('request.jwt.claims'"), "must read the authoritative JWT claims GUC");
    assert.ok(sql.includes("v_jwt_role = 'service_role'"), "only service_role JWTs pass the backend path");
    assert.ok(sql.includes("denied for JWT role"), "anon/authenticated JWTs must be denied inside the body");
    assert.ok(sql.includes("malformed JWT claims"), "malformed claims must fail closed");
    assert.ok(
      sql.includes('backend path allows source "platform_api" only'),
      "server API workflows must be platform_api-only",
    );
    assert.ok(
      sql.includes("p_source not in ('platform_api', 'manual', 'mock', 'admin_override')"),
      "direct admin sessions retain the historical/admin source allowlist",
    );
    assert.ok(
      !sql.includes("p_role") && !sql.includes("p_user_id") && !sql.includes("p_requested_by"),
      "authorization must never rely on a client-supplied role or user id",
    );
    assert.ok(
      sql.indexOf("denied for JWT role") < sql.indexOf("insert into public.clip_metrics"),
      "authorization must run before any write",
    );
  });

  await test("ingest hardening preserves fail-closed earnings invariants", () => {
    const sql = readRepo("supabase/migrations/20250101000010_harden_ingest_clip_metrics.sql");
    assert.ok(/security\s+definer/i.test(sql), "must stay SECURITY DEFINER");
    assert.ok(/set\s+search_path\s*=\s*public/i.test(sql), "search_path must stay pinned to public");
    assert.ok(
      sql.includes("v_clip.verified_views is null then p_views"),
      "verified_views monotonic regression guard must be preserved",
    );
    assert.ok(sql.includes("p_views > v_clip.verified_views"), "guard must only accept higher/equal views");
    assert.ok(sql.includes("finalize_clip_earning"), "auto-finalize of approved clips must be preserved");
    assert.ok(
      sql.includes("p_verification_status not in ('pending', 'verified', 'failed', 'disputed')"),
      "verification_status validation must remain fail-closed",
    );
    assert.ok(sql.includes("if p_views < 0 then"), "negative views must stay rejected");
    assert.ok(sql.includes("insert into public.clip_metrics"), "immutable snapshot insert must remain");
    assert.ok(
      !sql.includes("verified_views = p_views"),
      "regression guard must not be replaced by an unconditional overwrite",
    );
  });

  await test("SQL suite covers ingest authorization tests A–L", () => {
    const sql = readRepo("supabase/ingest-clip-metrics-security-tests.sql");
    for (const label of [
      "A1:", "A2:", "B1:", "B2:", "C1:", "D1:", "D3:", "E1:", "E2:",
      "F1:", "F3:", "G1:", "H1:", "I1:", "I4:", "J1:", "J2:", "K1:", "K2:",
      "L1", "L2:", "L3:", "L4:",
    ]) {
      assert.ok(sql.includes(label), `missing test label ${label}`);
    }
    assert.ok(sql.includes("has_function_privilege"), "privilege-model assertions required");
    assert.ok(sql.includes("set_config('request.jwt.claims'"), "behavioral JWT simulation required");
    assert.ok(sql.includes("SET LOCAL ROLE authenticated"), "RLS behavioral insert attempt required");
    assert.ok(sql.includes('role":"service_role"'), "service-role functional boundary required");
    assert.ok(sql.includes("DROP FUNCTION IF EXISTS public._ingest_sec_"), "test helpers must be cleaned up");
  });

  await test("README documents migration 000010 as authoritative ingest definition", () => {
    const readme = readRepo("supabase/migrations/README.md");
    assert.ok(readme.includes("20250101000010_harden_ingest_clip_metrics.sql"), "migration must be documented");
    assert.ok(readme.includes("ingest-clip-metrics-security-tests.sql"), "test suite must be documented");
    assert.ok(
      readme.includes("| migrations/20250101000010_harden_ingest_clip_metrics.sql |"),
      "function inventory must point at migration 000010 as authoritative",
    );
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
