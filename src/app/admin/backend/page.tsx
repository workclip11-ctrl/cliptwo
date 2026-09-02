"use client";

import { useRef, useState } from "react";
import { Server, Check, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

export default function AdminBackend() {
  const { siteSettings, campaigns, clips, profiles, setSiteSettings } = useStore();
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  const [ping, setPing] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = "";
  }

  function save() {
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Backend</h1>
        <p className="mt-1 text-sm text-muted">
          Connection status and payout configuration.
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Supabase
        </h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Status</span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              {isSupabaseConfigured ? (
                <>
                  <Check size={14} className="text-green" /> Connected
                </>
              ) : (
                <span className="text-amber">Not configured</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Live ping</span>
            <button
              onClick={testConnection}
              disabled={!isSupabaseConfigured || ping === "testing"}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft disabled:opacity-60"
            >
              <RefreshCw size={12} className={ping === "testing" ? "animate-spin" : ""} />
              {ping === "ok"
                ? "Reachable"
                : ping === "fail"
                  ? "Unreachable"
                  : ping === "testing"
                    ? "Testing…"
                    : "Test connection"}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Host</span>
            <span className="font-mono text-xs">{host || "—"}</span>
          </div>
        </div>
        {!isSupabaseConfigured && (
          <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-xs text-amber">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to
            enable live data. The app currently runs on seed data.
          </p>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Data counts
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl bg-background p-4">
            <p className="font-mono text-xl font-semibold">{campaigns.length}</p>
            <p className="text-xs text-muted">campaigns</p>
          </div>
          <div className="rounded-xl bg-background p-4">
            <p className="font-mono text-xl font-semibold">{clips.length}</p>
            <p className="text-xs text-muted">clips</p>
          </div>
          <div className="rounded-xl bg-background p-4">
            <p className="font-mono text-xl font-semibold">{profiles.length}</p>
            <p className="text-xs text-muted">profiles</p>
          </div>
          <div className="rounded-xl bg-background p-4">
            <p className="font-mono text-xl font-semibold">{profiles.filter((p) => p.role === "admin").length}</p>
            <p className="text-xs text-muted">admins</p>
          </div>
        </div>
      </section>

      <p className="flex items-start gap-2 text-xs text-muted">
        <Server size={14} className="mt-0.5 shrink-0" />
        Admin tables (profiles, site_settings) are created by running
        <code className="mx-1 rounded bg-accent-soft px-1.5 py-0.5">supabase/admin-schema.sql</code>
        in the Supabase SQL editor.
      </p>
    </div>
  );
}
