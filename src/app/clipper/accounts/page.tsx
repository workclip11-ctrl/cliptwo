"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Link2,
  RefreshCw,
  Unlink,
  Plug,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldOff,
  X,
  ExternalLink,
  Loader2,
  Lock,
} from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  CONNECTABLE_PLATFORMS,
  COMING_SOON_PLATFORMS,
} from "@/lib/social";
import type { Platform, SocialAccount, SocialAccountStatus } from "@/lib/types";

const STATUS_META: Record<
  SocialAccountStatus,
  { label: string; className: string }
> = {
  not_connected: {
    label: "Not connected",
    className: "border-border bg-background text-muted",
  },
  connecting: {
    label: "Connecting…",
    className: "border-amber/30 bg-amber/10 text-amber",
  },
  connected: {
    label: "Connected",
    className: "border-green/30 bg-accent-soft text-green",
  },
  verified: {
    label: "Verified",
    className: "border-green/30 bg-accent-soft text-green",
  },
  connection_error: {
    label: "Connection error",
    className: "border-red/30 bg-red/5 text-red",
  },
  disconnected: {
    label: "Disconnected",
    className: "border-border bg-background text-muted",
  },
  verification_failed: {
    label: "Verification failed",
    className: "border-amber/30 bg-amber/10 text-amber",
  },
};

function fmtDate(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SocialAccountsPage() {
  const { socialAccounts, updateSocialAccount, clips, refreshClips } = useStore();
  const { user } = useAuth();
  const myAccounts = socialAccounts.filter(
    (a) => a.userId && a.userId === user?.id,
  );

  // Reload social accounts from DB (called after OAuth callback)
  const reloadSocialAccounts = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return;
    const { data } = await supabase
      .from("social_accounts")
      .select("*")
      .eq("user_id", user.id);
    if (!data) return;
    // Update store with fresh DB data for each account
    for (const r of data) {
      const mapped = {
        id: r.id as string,
        userId: r.user_id as string,
        platform: r.platform as Platform,
        handle: r.handle as string,
        providerAccountId: r.provider_account_id as string | undefined,
        avatarUrl: r.avatar_url as string | undefined,
        status: r.status as SocialAccountStatus,
        verified: r.verified as boolean,
        connectedAt: r.connected_at ? new Date(r.connected_at as string).getTime() : undefined,
        lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at as string).getTime() : undefined,
        error: r.error as string | undefined,
      };
      updateSocialAccount(mapped.id, mapped);
    }
  }, [user, updateSocialAccount]);

  const [connecting, setConnecting] = useState<string | null>(null);
  const [modal, setModal] = useState<Platform | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ platform: string; message: string; error?: boolean } | null>(null);

  /** Get the current tab's Supabase access token for Bearer auth. */
  async function getAccessToken(): Promise<string | null> {
    if (!isSupabaseConfigured) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  // Handle OAuth callback results from URL params and reload from DB.
  // Runs once on mount after redirect from OAuth callback.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedPlatform = params.get("connected");
    const error = params.get("error");

    if (error) {
      const errorMessages: Record<string, string> = {
        provider_denied: "You denied access on the provider's page.",
        invalid_state: "OAuth state expired or was already used. Please try again.",
        state_expired: "The OAuth session expired. Please try again.",
        missing_params: "Missing required parameters from the OAuth callback.",
        platform_mismatch: "Platform mismatch during OAuth flow.",
        unknown_platform: "Unknown platform in OAuth callback.",
      };
      const friendlyMessage = errorMessages[error]
        ?? `OAuth failed: ${decodeURIComponent(error)}`;
      // Defer state update to avoid cascading renders
      queueMicrotask(() => setOauthError(friendlyMessage));
      void reloadSocialAccounts();
    } else if (connectedPlatform) {
      void reloadSocialAccounts();
    }

    if (error || connectedPlatform) {
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("verified");
      url.searchParams.delete("error");
      url.searchParams.delete("platform");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── OAuth initiation ──────────────────────────────────────────────────────
  // SECURITY: Does NOT create a fake social_accounts row in the DB.
  // The server OAuth callback creates/updates the real record via service-role.
  // Local "connecting" state is tracked only in component state.

  async function submitConnect() {
    if (!modal) return;
    const platform = modal;
    setOauthError(null);
    setConnecting(platform);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Your Cliptwo session has expired. Please log in again.");
      }

      const res = await fetch("/api/social/oauth/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ platform }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate OAuth");
      }

      // Success — redirect to provider
      setModal(null);
      window.location.href = data.authorizationUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "OAuth initiation failed";
      console.error("OAuth initiation failed:", msg);
      setOauthError(msg);
      setConnecting(null);
    }
  }

  // ── Reconnect ─────────────────────────────────────────────────────────────
  // SECURITY: Does NOT update the DB directly. Server OAuth callback handles it.

  async function reconnect(acc: SocialAccount) {
    setConnecting(acc.id);
    setOauthError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Your Cliptwo session has expired. Please log in again.");
      }

      const res = await fetch("/api/social/oauth/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ platform: acc.platform }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate reconnection");
      }

      window.location.href = data.authorizationUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Reconnection failed";
      console.error("Reconnect failed:", msg);
      setOauthError(msg);
      setConnecting(null);
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async function disconnect(acc: SocialAccount) {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error("Disconnect failed: session expired");
        return;
      }

      const res = await fetch("/api/social/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ socialAccountId: acc.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Disconnect failed:", body.error ?? res.statusText);
        return;
      }
    } catch (e) {
      console.error("Disconnect request failed:", e);
      return;
    }
    updateSocialAccount(acc.id, { status: "disconnected", verified: false });
  }

  // ── Verify ownership ──────────────────────────────────────────────────────
  // SECURITY: Server-side verifies and updates social_accounts via service-role.
  // Local state is updated optimistically after server confirms.

  async function verifyAccount(acc: SocialAccount) {
    setVerifying(acc.id);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        updateSocialAccount(acc.id, {
          status: "connection_error",
          error: "Session expired. Please log in again.",
        });
        return;
      }

      const res = await fetch("/api/social/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ socialAccountId: acc.id }),
      });

      const data = await res.json();

      if (data.verified) {
        updateSocialAccount(acc.id, {
          verified: true,
          status: "verified",
          providerAccountId: data.providerAccountId,
        });
      } else {
        updateSocialAccount(acc.id, {
          verified: false,
          status: "verification_failed",
          error: data.error || "Verification failed",
        });
      }
    } catch {
      updateSocialAccount(acc.id, {
        status: "connection_error",
        error: "Verification request failed",
      });
    } finally {
      setVerifying(null);
    }
  }

  // ── Sync now ──────────────────────────────────────────────────────────────
  // Calls POST /api/metrics/sync with the current tab's Bearer access token.
  // Syncs all approved clips for this platform that belong to the current user.

  async function syncNow(acc: SocialAccount) {
    if (!user) return;
    setSyncing(acc.platform);
    setSyncResult(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Your Cliptwo session has expired. Please log in again.");
      }

      // Find the user's approved clips for this platform from local store
      const myApprovedClips = clips.filter(
        (c) => c.userId === user.id && c.platform === acc.platform && c.status === "approved",
      );

      if (myApprovedClips.length === 0) {
        setSyncResult({
          platform: acc.platform,
          message: "No approved clips to sync for this platform.",
          error: true,
        });
        return;
      }

      const clipIds = myApprovedClips.map((c) => c.id);

      const res = await fetch("/api/metrics/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ clipIds }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Sync failed");
      }

      // Process results
      const results = data.results as Array<{
        clipId: string;
        status: string;
        metrics?: { views: number; likes: number; comments: number; shares: number };
        error?: string;
      }>;

      const synced = results.filter((r) => r.status === "synced");
      const errors = results.filter((r) => r.status === "error" || r.status === "rejected");
      const skipped = results.filter((r) => r.status === "skipped");

      if (synced.length > 0) {
        const totalViews = synced.reduce((sum, r) => sum + (r.metrics?.views ?? 0), 0);
        setSyncResult({
          platform: acc.platform,
          message: `Synced ${synced.length} clip${synced.length > 1 ? "s" : ""} — ${totalViews.toLocaleString()} verified views`,
        });
      } else if (errors.length > 0) {
        setSyncResult({
          platform: acc.platform,
          message: errors.map((e) => e.error).join("; "),
          error: true,
        });
      } else if (skipped.length > 0) {
        setSyncResult({
          platform: acc.platform,
          message: skipped.map((s) => s.error).join("; "),
          error: true,
        });
      } else {
        setSyncResult({
          platform: acc.platform,
          message: "Sync completed.",
        });
      }

      // Reload social accounts and clips from DB to get fresh data
      void reloadSocialAccounts();
      void refreshClips();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      setSyncResult({ platform: acc.platform, message: msg, error: true });
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Connected accounts
        </h1>
        <p className="mt-1 text-sm text-muted">
          Connect the platforms you post clips to. Payouts and view tracking use
          these connections.
        </p>
      </div>

      {/* Connectable platforms (YouTube, Instagram) */}
      <div className="space-y-3">
        {CONNECTABLE_PLATFORMS.map((platform) => {
          const acc = myAccounts.find((a) => a.platform === platform);
          const isConnecting =
            connecting === platform || (acc && connecting === acc.id);
          const isVerifying = verifying === acc?.id;

          return (
            <div
              key={platform}
              className="rounded-2xl border bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <PlatformIcon p={platform} size={22} />
                  <div>
                    <p className="text-sm font-semibold">{platform}</p>
                    <p className="text-xs text-muted">
                      {acc ? acc.handle : "Not connected yet"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                      STATUS_META[acc?.status ?? "not_connected"].className
                    }`}
                  >
                    {acc?.status === "verified" && <CheckCircle2 size={13} />}
                    {acc?.status === "connection_error" && (
                      <AlertTriangle size={13} />
                    )}
                    {acc?.status === "verification_failed" && (
                      <AlertTriangle size={13} />
                    )}
                    {(acc?.status === "connecting" || isConnecting) && (
                      <Clock size={13} />
                    )}
                    {isVerifying && <Loader2 size={13} className="animate-spin" />}
                    {isConnecting
                      ? "Connecting…"
                      : isVerifying
                        ? "Verifying…"
                        : STATUS_META[acc?.status ?? "not_connected"].label}
                  </span>
                </div>
              </div>

              {acc ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div className="rounded-xl bg-background p-3">
                      <p className="text-xs text-muted">Verification</p>
                      <p
                        className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium ${
                          acc.verified ? "text-green" : "text-muted"
                        }`}
                      >
                        {acc.verified ? (
                          <>
                            <ShieldCheck size={13} /> Verified
                          </>
                        ) : (
                          <>
                            <ShieldOff size={13} /> Unverified
                          </>
                        )}
                      </p>
                    </div>
                    <div className="rounded-xl bg-background p-3">
                      <p className="text-xs text-muted">Connected</p>
                      <p className="mt-1 font-mono text-xs">
                        {fmtDate(acc.connectedAt)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-background p-3">
                      <p className="text-xs text-muted">Last sync</p>
                      <p className="mt-1 font-mono text-xs">
                        {fmtDate(acc.lastSyncAt)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-background p-3">
                      <p className="text-xs text-muted">Token</p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-green">
                        <ShieldCheck size={13} /> Server-only
                      </p>
                    </div>
                  </div>

                  {acc.status === "connection_error" && acc.error && (
                    <p className="mt-3 rounded-md border border-red/30 bg-red/5 p-2 text-xs text-red">
                      {acc.error}
                    </p>
                  )}

                  {acc.status === "verification_failed" && acc.error && (
                    <p className="mt-3 rounded-md border border-amber/30 bg-amber/5 p-2 text-xs text-amber">
                      {acc.error}
                    </p>
                  )}

                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                    <ShieldCheck size={12} className="text-green" />
                    Tokens are stored server-side with AES-256-GCM encryption
                    and never exposed to the browser.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(acc.status === "connected" ||
                      acc.status === "verified") && (
                      <>
                        <button
                          onClick={() => syncNow(acc)}
                          disabled={syncing === acc.platform}
                          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent-soft disabled:opacity-50"
                        >
                          {syncing === acc.platform ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RefreshCw size={13} />
                          )}
                          {syncing === acc.platform ? "Syncing…" : "Sync now"}
                        </button>
                        {!acc.verified && (
                          <button
                            onClick={() => verifyAccount(acc)}
                            disabled={isVerifying}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-green/30 px-3 py-1.5 text-xs font-medium text-green hover:bg-accent-soft disabled:opacity-50"
                          >
                            <ShieldCheck size={13} /> Verify ownership
                          </button>
                        )}
                      </>
                    )}
                    {(acc.status === "disconnected" ||
                      acc.status === "connection_error" ||
                      acc.status === "verification_failed") && (
                      <button
                        onClick={() => reconnect(acc)}
                        disabled={isConnecting}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        <Plug size={13} /> Reconnect
                      </button>
                    )}
                    {acc.status !== "disconnected" &&
                      acc.status !== "connection_error" &&
                      acc.status !== "verification_failed" && (
                        <button
                          onClick={() => disconnect(acc)}
                          disabled={isConnecting || acc.status === "connecting"}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red/30 px-3 py-1.5 text-xs font-medium text-red disabled:opacity-50"
                        >
                          <Unlink size={13} /> Disconnect
                        </button>
                      )}
                  </div>

                  {syncResult && syncResult.platform === acc.platform && (
                    <div
                      className={`mt-3 rounded-md border p-2 text-xs ${
                        syncResult.error
                          ? "border-red/30 bg-red/5 text-red"
                          : "border-green/30 bg-accent-soft text-green"
                      }`}
                    >
                      {syncResult.message}
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={() => openConnect(platform)}
                  disabled={isConnecting}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Link2 size={14} />
                  {isConnecting ? "Connecting…" : "Connect"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Coming soon platforms (Kick) */}
      {COMING_SOON_PLATFORMS.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Coming soon
          </p>
          {COMING_SOON_PLATFORMS.map((platform) => (
            <div
              key={platform}
              className="rounded-2xl border border-dashed bg-background/50 p-5 opacity-60"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <PlatformIcon p={platform} size={22} />
                  <div>
                    <p className="text-sm font-semibold">{platform}</p>
                    <p className="text-xs text-muted">
                      Integration coming soon — no public API available yet
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted">
                    <Lock size={12} /> Not available
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OAuth error banner (shown outside modal for reconnect errors) */}
      {oauthError && !modal && (
        <div className="rounded-xl border border-red/30 bg-red/5 p-4 text-sm text-red">
          <p className="font-medium">Connection failed</p>
          <p className="mt-1 text-xs">{oauthError}</p>
          <button
            onClick={() => setOauthError(null)}
            className="mt-2 text-xs font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Connect {modal}</h2>
              <button
                onClick={() => {
                  setModal(null);
                  setOauthError(null);
                }}
                aria-label="Close"
                className="rounded-md p-1 text-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">
              You&apos;ll be redirected to {modal} to authorize the connection.
              Your channel will be verified automatically.
            </p>

            {oauthError && (
              <div className="mt-3 rounded-md border border-red/30 bg-red/5 p-3 text-xs text-red">
                {oauthError}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={submitConnect}
                disabled={!!connecting}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {connecting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ExternalLink size={14} />
                )}
                {connecting ? "Connecting…" : "Connect via OAuth"}
              </button>
              <button
                onClick={() => {
                  setModal(null);
                  setOauthError(null);
                }}
                className="rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function openConnect(platform: Platform) {
    setModal(platform);
  }
}
