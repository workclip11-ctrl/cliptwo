"use client";

import { useState } from "react";
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
} from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { SUPPORTED_PLATFORMS } from "@/lib/social";
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
    (a) => a.userId === user?.id || !a.userId,
  );

  const [connecting, setConnecting] = useState<string | null>(null);
  const [modal, setModal] = useState<Platform | null>(null);
  const [handle, setHandle] = useState("");

  function submitConnect() {
    if (!modal) return;
    const h = handle.trim();
    if (!h) return;
    const platform = modal;
    setModal(null);
    setConnecting(platform);
    const id = addSocialAccount({
      userId: user?.id,
      platform,
      handle: h,
      status: "connecting",
      verified: false,
    });
    setTimeout(() => {
      updateSocialAccount(id, {
        status: "connected",
        connectedAt: new Date().getTime(),
        lastSyncAt: new Date().getTime(),
      });
      setConnecting(null);
    }, 1200);
  }

  function reconnect(acc: SocialAccount) {
    setConnecting(acc.id);
    updateSocialAccount(acc.id, { status: "connecting", error: undefined });
    setTimeout(() => {
      updateSocialAccount(acc.id, {
        status: "connected",
        connectedAt: acc.connectedAt ?? new Date().getTime(),
        lastSyncAt: new Date().getTime(),
      });
      setConnecting(null);
    }, 1200);
  }

  function disconnect(acc: SocialAccount) {
    updateSocialAccount(acc.id, { status: "disconnected" });
  }

  function syncNow(acc: SocialAccount) {
    updateSocialAccount(acc.id, { lastSyncAt: new Date().getTime() });
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

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    STATUS_META[acc?.status ?? "not_connected"].className
                  }`}
                >
                  {acc?.status === "verified" && <CheckCircle2 size={13} />}
                  {acc?.status === "connection_error" && <AlertTriangle size={13} />}
                  {acc?.status === "connecting" && <Clock size={13} />}
                  {isConnecting
                    ? "Connecting…"
                    : STATUS_META[acc?.status ?? "not_connected"].label}
                </span>
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
                        <ShieldCheck size={13} /> Secure (server only)
                      </p>
                    </div>
                  </div>

                  {acc.status === "connection_error" && acc.error && (
                    <p className="mt-3 rounded-md border border-red/30 bg-red/5 p-2 text-xs text-red">
                      {acc.error}
                    </p>
                  )}

                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                    <ShieldCheck size={12} className="text-green" />
                    Verification is performed by our backend after connecting. Your
                    account tokens are stored server-side and never exposed to the
                    browser.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(acc.status === "connected" || acc.status === "verified") && (
                      <button
                        onClick={() => syncNow(acc)}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent-soft"
                      >
                        <RefreshCw size={13} /> Sync now
                      </button>
                    )}
                    {(acc.status === "disconnected" ||
                      acc.status === "connection_error") && (
                      <button
                        onClick={() => reconnect(acc)}
                        disabled={isConnecting}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        <Plug size={13} /> Reconnect
                      </button>
                    )}
                    {acc.status !== "disconnected" &&
                      acc.status !== "connection_error" && (
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
                onClick={() => { setModal(null); setHandle(""); }}
                aria-label="Close"
                className="rounded-md p-1 text-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
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
            <p className="mt-2 text-xs text-muted">
              This prototype simulates the OAuth handshake. In production a
              backend exchange issues the access token (stored server-side only).
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={submitConnect}
                disabled={!handle.trim()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Link2 size={14} /> Connect
              </button>
              <button
                onClick={() => { setModal(null); setHandle(""); }}
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
