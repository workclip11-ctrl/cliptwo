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
} from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { SUPPORTED_PLATFORMS } from "@/lib/social";
import { isProviderConfigured } from "@/lib/social-providers";
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
  const { socialAccounts, addSocialAccount, updateSocialAccount } = useStore();
  const { user } = useAuth();
  const myAccounts = socialAccounts.filter(
    (a) => a.userId && a.userId === user?.id,
  );

  const [connecting, setConnecting] = useState<string | null>(null);
  const [modal, setModal] = useState<Platform | null>(null);
  const [handle, setHandle] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null);

  // Handle OAuth callback results from URL params
  const handleOAuthCallback = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedPlatform = params.get("connected");
    const verified = params.get("verified");
    const error = params.get("error");
    const platform = params.get("platform");

    if (error) {
      // OAuth callback had an error
      const account = myAccounts.find(
        (a) => a.platform.toLowerCase() === (platform ?? "").toLowerCase(),
      );
      if (account) {
        updateSocialAccount(account.id, {
          status: "connection_error",
          error: `OAuth error: ${error.replace(/_/g, " ")}`,
        });
      }
    } else if (connectedPlatform) {
      // OAuth succeeded — find the account that was just connected
      const account = myAccounts.find(
        (a) =>
          a.platform.toLowerCase() === connectedPlatform.toLowerCase() &&
          a.status === "connecting",
      );
      if (account) {
        updateSocialAccount(account.id, {
          status: verified === "true" ? "verified" : "connected",
          verified: verified === "true",
          connectedAt: Date.now(),
          lastSyncAt: Date.now(),
        });
      }
    }

    // Clean up URL params
    if (error || connectedPlatform) {
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("verified");
      url.searchParams.delete("error");
      url.searchParams.delete("platform");
      window.history.replaceState({}, "", url.toString());
    }
  }, [myAccounts, updateSocialAccount]);

  useEffect(() => {
    handleOAuthCallback();
  }, [handleOAuthCallback]);

  // ── OAuth initiation ──────────────────────────────────────────────────────

  async function submitConnect() {
    if (!modal) return;
    const h = handle.trim();
    if (!h) return;
    const platform = modal;
    setModal(null);
    setConnecting(platform);

    // Create the social account in "connecting" state
    const id = addSocialAccount({
      userId: user?.id,
      platform,
      handle: h,
      status: "connecting",
      verified: false,
    });

    try {
      // Initiate OAuth — get the authorization URL
      const res = await fetch("/api/social/oauth/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate OAuth");
      }

      // In mock mode, the callback URL is returned directly
      // In production, the browser redirects to the provider's auth page
      if (data.mock) {
        // Mock mode: simulate the flow with a delay
        setTimeout(() => {
          updateSocialAccount(id, {
            status: "connected",
            connectedAt: Date.now(),
            lastSyncAt: Date.now(),
          });
          setConnecting(null);
        }, 1200);
      } else {
        // Real OAuth: redirect to provider
        window.location.href = data.authorizationUrl;
      }
    } catch (e) {
      updateSocialAccount(id, {
        status: "connection_error",
        error: e instanceof Error ? e.message : "Connection failed",
      });
      setConnecting(null);
    }
  }

  // ── Reconnect ─────────────────────────────────────────────────────────────

  async function reconnect(acc: SocialAccount) {
    setConnecting(acc.id);
    updateSocialAccount(acc.id, { status: "connecting", error: undefined });

    try {
      const res = await fetch("/api/social/oauth/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: acc.platform }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate reconnection");
      }

      if (data.mock) {
        setTimeout(() => {
          updateSocialAccount(acc.id, {
            status: "connected",
            connectedAt: acc.connectedAt ?? Date.now(),
            lastSyncAt: Date.now(),
          });
          setConnecting(null);
        }, 1200);
      } else {
        window.location.href = data.authorizationUrl;
      }
    } catch (e) {
      updateSocialAccount(acc.id, {
        status: "connection_error",
        error: e instanceof Error ? e.message : "Reconnection failed",
      });
      setConnecting(null);
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async function disconnect(acc: SocialAccount) {
    try {
      const res = await fetch("/api/social/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  async function verifyAccount(acc: SocialAccount) {
    setVerifying(acc.id);
    try {
      const res = await fetch("/api/social/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  async function syncNow(acc: SocialAccount) {
    updateSocialAccount(acc.id, { lastSyncAt: Date.now() });
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

      <div className="space-y-3">
        {SUPPORTED_PLATFORMS.map((platform) => {
          const acc = myAccounts.find((a) => a.platform === platform);
          const isConnecting =
            connecting === platform || (acc && connecting === acc.id);
          const isVerifying = verifying === acc?.id;
          const mockMode = !isProviderConfigured(platform);

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
                  {mockMode && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber">
                      Dev mode
                    </span>
                  )}
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
                          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent-soft"
                        >
                          <RefreshCw size={13} /> Sync now
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Connect {modal}</h2>
              <button
                onClick={() => {
                  setModal(null);
                  setHandle("");
                }}
                aria-label="Close"
                className="rounded-md p-1 text-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">
              Enter your {modal} username. You&apos;ll be redirected to {modal} to
              authorize the connection.
            </p>
            <label className="mt-4 block text-sm">
              <span className="text-muted">Username / handle</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@yourhandle"
                autoFocus
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </label>

            <div className="mt-4 flex gap-2">
              <button
                onClick={submitConnect}
                disabled={!handle.trim()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <ExternalLink size={14} /> Connect via OAuth
              </button>
              <button
                onClick={() => {
                  setModal(null);
                  setHandle("");
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
    setHandle("");
  }
}
