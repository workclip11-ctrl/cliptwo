"use client";

import { useRef, useState } from "react";
import { RefreshCw, Server } from "lucide-react";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

export default function AdminBackend() {
  const { siteSettings, campaigns, clips, profiles, setSiteSettings } = useStore();
  const [_saved, setSaved] = useState(false);
  const dirty = useRef(false);
  const [ping, setPing] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = "";
  }

  function _save() {
    dirty.current = false;
    setSiteSettings({
      heroTitle: siteSettings.heroTitle,
      heroSubtitle: siteSettings.heroSubtitle,
      featuredIds: siteSettings.featuredIds,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testConnection() {
    if (!isSupabaseConfigured) return;
    setPing("testing");
    try {
      const { error } = await supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true });
      setPing(error ? "fail" : "ok");
    } catch {
      setPing("fail");
    }
    setTimeout(() => setPing("idle"), 4000);
  }

  return (
    <div className="mx-auto max-w-[1120px] space-y-12">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
          Backend
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Monitor ClipTwo backend services, integrations, and system configuration.
        </p>
      </div>

      {/* ── Section 1: Supabase connection ───────────────── */}
      <section>
        <h2 className="text-[18px] font-bold tracking-tight">Supabase</h2>
        <p className="mt-1 text-[13px] text-muted">
          Database connection status and live connectivity check.
        </p>

        <div className="mt-6 space-y-4">
          {/* Status row */}
          <div className="flex items-center justify-between rounded-[10px] border border-border/40 bg-card px-5 py-4">
            <div>
              <p className="text-[15px] font-medium">Connection status</p>
              <p className="mt-0.5 text-[13px] text-muted">
                Primary database and authentication provider
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-[14px] font-medium ${
                isSupabaseConfigured ? "text-green" : "text-amber"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isSupabaseConfigured ? "bg-green" : "bg-amber"
                }`}
              />
              {isSupabaseConfigured ? "Connected" : "Not configured"}
            </span>
          </div>

          {/* Host row */}
          <div className="flex items-center justify-between rounded-[10px] border border-border/40 bg-card px-5 py-4">
            <div>
              <p className="text-[15px] font-medium">Host</p>
              <p className="mt-0.5 text-[13px] text-muted">
                Supabase project endpoint
              </p>
            </div>
            <span className="font-mono text-[14px] text-muted">
              {host || "—"}
            </span>
          </div>

          {/* Test connection row */}
          <div className="flex items-center justify-between rounded-[10px] border border-border/40 bg-card px-5 py-4">
            <div>
              <p className="text-[15px] font-medium">Live ping</p>
              <p className="mt-0.5 text-[13px] text-muted">
                Verify the connection is reachable right now
              </p>
            </div>
            <button
              onClick={testConnection}
              disabled={!isSupabaseConfigured || ping === "testing"}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border/60 px-4 text-[13px] font-medium transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={ping === "testing" ? "animate-spin" : ""}
              />
              {ping === "ok"
                ? "Reachable"
                : ping === "fail"
                  ? "Unreachable"
                  : ping === "testing"
                    ? "Testing…"
                    : "Test connection"}
            </button>
          </div>

          {/* Config warning */}
          {!isSupabaseConfigured && (
            <div className="rounded-[10px] border border-amber/20 bg-amber/5 px-5 py-4 text-[13px] text-amber">
              Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable
              live data. The app currently runs on seed data.
            </div>
          )}
        </div>
      </section>

      {/* ── Section 2: Data counts ──────────────────────── */}
      <section>
        <h2 className="text-[18px] font-bold tracking-tight">Data counts</h2>
        <p className="mt-1 text-[13px] text-muted">
          Current totals across the platform database.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Campaigns", value: campaigns.length },
            { label: "Clips", value: clips.length },
            { label: "Profiles", value: profiles.length },
            {
              label: "Admins",
              value: profiles.filter((p) => p.role === "admin").length,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[10px] border border-border/40 bg-card px-5 py-4"
            >
              <p className="text-[22px] font-bold tracking-tight">{item.value}</p>
              <p className="mt-0.5 text-[13px] text-muted">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer note ─────────────────────────────────── */}
      <p className="flex items-start gap-2 text-[13px] text-muted">
        <Server size={14} className="mt-0.5 shrink-0" />
        Admin tables (profiles, site_settings) are created by running{" "}
        <code className="mx-1 rounded-[4px] bg-accent-soft px-1.5 py-0.5 font-mono text-[12px]">
          supabase/admin-schema.sql
        </code>{" "}
        in the Supabase SQL editor.
      </p>
    </div>
  );
}
