"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Link2, CheckCircle2, BadgeCheck, Save } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

const INITIAL_ACCOUNTS = [
  { platform: "Instagram", handle: "@maya.cuts", status: "verified" },
  { platform: "YouTube", handle: "@mayacuts", status: "verified" },
  { platform: "TikTok", handle: "@maya.in", status: "connecting" },
];

export default function ClipperSettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profiles, updateProfile } = useStore();
  const [name, setName] = useState("");
  const [upi, setUpi] = useState("");
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [saved, setSaved] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!loaded.current && user) {
      const me = profiles.find((p) => p.id === user.id);
      setName(user.name || user.email || "");
      setUpi(me?.upi ?? "");
      loaded.current = true;
    }
  }, [user, profiles]);

  function toggle(platform: string) {
    setAccounts((prev) =>
      prev.map((a) =>
        a.platform === platform
          ? { ...a, status: a.status === "verified" ? "connecting" : "verified" }
          : a,
      ),
    );
  }

  function save() {
    if (!user) return;
    updateProfile(user.id, { name: name.trim(), upi: upi.trim() });
    if (isSupabaseConfigured) {
      supabase.auth.updateUser({ data: { name: name.trim() } }).catch(() => {});
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted">Manage your profile, connections and payouts.</p>
        </div>
        <button
          onClick={() => {
            signOut();
            router.push("/login");
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
        >
          <LogOut size={14} /> Log out
        </button>
      </div>

      {/* Profile */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Profile details
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">Display name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Email</span>
            <input
              value={user?.email ?? ""}
              readOnly
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-muted outline-none"
            />
          </label>
        </div>
      </section>

      {/* Social accounts */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Social media accounts
        </h2>
        <ul className="mt-4 divide-y">
          {accounts.map((a) => (
            <li key={a.platform} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <PlatformIcon p={a.platform as never} size={20} />
                <div>
                  <p className="text-sm font-medium">{a.platform}</p>
                  <p className="text-xs text-muted">{a.handle}</p>
                </div>
              </div>
              {a.status === "verified" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-accent-soft px-3 py-1.5 text-xs font-medium text-green">
                  <CheckCircle2 size={13} /> Connected
                </span>
              ) : (
                <button
                  onClick={() => toggle(a.platform)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent-soft"
                >
                  <Link2 size={13} /> Connect
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Connect buttons are demo-only in this prototype build.
        </p>
      </section>

      {/* UPI */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          UPI details
        </h2>
        <label className="mt-4 block text-sm">
          <span className="text-muted">UPI ID</span>
          <input
            value={upi}
            onChange={(e) => setUpi(e.target.value)}
            placeholder="name@upi"
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground sm:max-w-xs"
          />
        </label>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <BadgeCheck size={13} className="text-green" /> Used for all clip payouts.
        </p>
      </section>

      <button
        onClick={save}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        <Save size={14} /> {saved ? "Saved" : "Save changes"}
      </button>
    </div>
  );
}
