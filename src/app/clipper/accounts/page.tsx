"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Link2,
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
  const { socialAccounts, updateSocialAccount } = useStore();
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

  return (
    <div className="mx-auto max-w-[1120px] space-y-8 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight">
          Connected accounts
        </h1>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-muted sm:text-[15px]">
          Connect the platforms you post clips to. Payouts and view tracking use
          these connections. Metrics sync automatically every 30 minutes.
        </p>
      </div>

      {/* ── Connectable Platforms ────────────────────────── */}
      <div className="space-y-3">
        {CONNECTABLE_PLATFORMS.map((platform) => {
          const acc = myAccounts.find((a) => a.platform === platform);
          const isConnecting =
            connecting === platform || (acc && connecting === acc.id);
          const isVerifying = verifying === acc?.id;

          return (
            <div
              key={platform}
              className="rounded-[12px] border bg-card p-5 transition-colors duration-150 hover:border-foreground/8 sm:p-6"
            >
              {acc ? (
                /* ── Connected account row ────────────────── */
                <>
                  {/* Top: identity + status */}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
                        <PlatformIcon p={platform} size={20} />
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold sm:text-[16px]">
                          {platform}
                        </p>
                        <p className="mt-0.5 text-[14px] text-muted">
                          {acc.handle}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium ${
                        STATUS_META[acc.status].className
                      }`}
                    >
                      {acc.status === "verified" && <CheckCircle2 size={13} />}
                      {acc.status === "connection_error" && (
                        <AlertTriangle size={13} />
                      )}
                      {acc.status === "verification_failed" && (
                        <AlertTriangle size={13} />
                      )}
                      {(acc.status === "connecting" || isConnecting) && (
                        <Clock size={13} />
                      )}
                      {isVerifying && <Loader2 size={13} className="animate-spin" />}
                      {isConnecting
                        ? "Connecting…"
                        : isVerifying
                          ? "Verifying…"
                          : STATUS_META[acc.status].label}
                    </span>
                  </div>

                  {/* Metadata line */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      {acc.verified ? (
                        <ShieldCheck size={13} className="text-green" />
                      ) : (
                        <ShieldOff size={13} />
                      )}
                      {acc.verified ? "Verified" : "Unverified"}
                    </span>
                    <span className="text-border">·</span>
                    <span>Connected {fmtDate(acc.connectedAt)}</span>
                    <span className="text-border">·</span>
                    <span>Last synced {fmtDate(acc.lastSyncAt)}</span>
                  </div>

                  {/* Error states */}
                  {acc.status === "connection_error" && acc.error && (
                    <p className="mt-3 rounded-lg border border-red/20 bg-red/[0.04] px-3.5 py-2.5 text-[13px] text-red">
                      {acc.error}
                    </p>
                  )}
                  {acc.status === "verification_failed" && acc.error && (
                    <p className="mt-3 rounded-lg border border-amber/20 bg-amber/[0.04] px-3.5 py-2.5 text-[13px] text-amber">
                      {acc.error}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(acc.status === "connected" ||
                      acc.status === "verified") && (
                      <>
                        {!acc.verified && (
                          <button
                            onClick={() => verifyAccount(acc)}
                            disabled={isVerifying}
                            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-green/30 px-4 text-[13px] font-medium text-green transition-colors duration-150 hover:bg-accent-soft disabled:opacity-50"
                          >
                            <ShieldCheck size={14} /> Verify ownership
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
                        className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-foreground/90 disabled:opacity-50"
                      >
                        <Plug size={14} /> Reconnect
                      </button>
                    )}
                    {acc.status !== "disconnected" &&
                      acc.status !== "connection_error" &&
                      acc.status !== "verification_failed" && (
                        <button
                          onClick={() => disconnect(acc)}
                          disabled={isConnecting || acc.status === "connecting"}
                          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-red/30 px-4 text-[13px] font-medium text-red transition-colors duration-150 hover:bg-red/5 disabled:opacity-50"
                        >
                          <Unlink size={14} /> Disconnect
                        </button>
                      )}
                  </div>
                </>
              ) : (
                /* ── Not connected row ────────────────────── */
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
                      <PlatformIcon p={platform} size={20} />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold sm:text-[16px]">
                        {platform}
                      </p>
                      <p className="mt-0.5 text-[14px] text-muted">
                        Not connected yet
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => openConnect(platform)}
                    disabled={isConnecting}
                    className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-foreground/90 disabled:opacity-50"
                  >
                    <Link2 size={14} />
                    {isConnecting ? "Connecting…" : "Connect account"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Coming Soon Platforms ────────────────────────── */}
      {COMING_SOON_PLATFORMS.length > 0 && (
        <div>
          <p className="mb-3 text-[13px] font-medium text-muted">
            Other platforms
          </p>
          <div className="space-y-2">
            {COMING_SOON_PLATFORMS.map((platform) => (
              <div
                key={platform}
                className="flex items-center justify-between rounded-[12px] border border-dashed bg-background/50 px-5 py-4 opacity-60"
              >
                <div className="flex items-center gap-3">
                  <PlatformIcon p={platform} size={18} />
                  <span className="text-[14px] font-medium">{platform}</span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                  <Lock size={12} /> Coming soon
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Security Note ───────────────────────────────── */}
      <div className="rounded-[12px] border border-dashed bg-background/50 px-5 py-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-green" />
          <div>
            <p className="text-[13px] font-medium">Security</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              Your connected-account tokens are stored securely server-side with
              AES-256-GCM encryption and never exposed to the browser.
            </p>
          </div>
        </div>
      </div>

      {/* ── OAuth Error Banner ──────────────────────────── */}
      {oauthError && !modal && (
        <div className="rounded-[12px] border border-red/20 bg-red/[0.04] p-4">
          <p className="text-[14px] font-medium text-red">Connection failed</p>
          <p className="mt-1 text-[13px] text-muted">{oauthError}</p>
          <button
            onClick={() => setOauthError(null)}
            className="mt-2 text-[13px] font-medium text-accent hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Connect Modal ───────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-[16px] border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold">Connect {modal}</h2>
              <button
                onClick={() => {
                  setModal(null);
                  setOauthError(null);
                }}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 text-[14px] text-muted">
              You&apos;ll be redirected to {modal} to authorize the connection.
              Your channel will be verified automatically.
            </p>

            {oauthError && (
              <div className="mt-3 rounded-lg border border-red/20 bg-red/[0.04] p-3 text-[13px] text-red">
                {oauthError}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={submitConnect}
                disabled={!!connecting}
                className="inline-flex flex-1 h-11 items-center justify-center gap-1.5 rounded-[10px] bg-accent text-[14px] font-medium text-white transition-colors duration-150 hover:bg-foreground/90 disabled:opacity-50"
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
                className="inline-flex h-11 items-center rounded-[10px] border px-5 text-[14px] font-medium transition-colors duration-150 hover:bg-accent-soft"
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
