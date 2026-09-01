"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Save,
  Bell,
  Eye,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export default function CreatorSettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profiles, updateProfile } = useStore();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [campaignAlerts, setCampaignAlerts] = useState(true);
  const [submissionAlerts, setSubmissionAlerts] = useState(true);
  const [saved, setSaved] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!loaded.current && user) {
      const me = profiles.find((p) => p.id === user.id);
      setName(user.name || user.email || "");
      setBio(me?.bio ?? "");
      loaded.current = true;
    }
  }, [user, profiles]);

  function save() {
    if (!user) return;
    updateProfile(user.id, { name: name.trim(), bio: bio.trim() });
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
          <p className="mt-1 text-sm text-muted">
            Manage your profile, notifications, and account.
          </p>
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
        <div className="mt-4 flex items-start gap-5">
          <div className="shrink-0">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-xl font-semibold text-white">
              {(user?.name?.[0] ?? "C").toUpperCase()}
            </span>
          </div>
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
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
            <label className="block sm:col-span-2 text-sm">
              <span className="text-muted">Bio</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell clippers about your brand…"
                rows={3}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground resize-none"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Notifications
        </h2>
        <p className="mt-1 text-sm text-muted">
          Choose what updates you receive.
        </p>
        <div className="mt-4 space-y-3">
          {[
            { label: "Email notifications", desc: "Receive updates via email", val: emailNotifs, set: setEmailNotifs, icon: Bell },
            { label: "Push notifications", desc: "Browser push alerts", val: pushNotifs, set: setPushNotifs, icon: Bell },
            { label: "Campaign updates", desc: "New submissions on your campaigns", val: campaignAlerts, set: setCampaignAlerts, icon: Eye },
            { label: "Submission alerts", desc: "When a clip is submitted or reviewed", val: submissionAlerts, set: setSubmissionAlerts, icon: Bell },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-xl bg-background px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <item.icon size={16} className="text-muted" />
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted">{item.desc}</p>
                </div>
              </div>
              <button
                onClick={() => item.set(!item.val)}
                aria-label={`Toggle ${item.label}`}
                className="text-muted hover:text-foreground"
              >
                {item.val ? (
                  <ToggleRight size={28} className="text-green" />
                ) : (
                  <ToggleLeft size={28} />
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-red/20 bg-card p-6">
        <h2 className="text-sm font-semibold text-red">Danger zone</h2>
        <p className="mt-1 text-sm text-muted">
          Permanently delete your account and all associated data.
        </p>
        <button className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-red/30 px-4 py-2 text-sm font-medium text-red hover:bg-red/5">
          <Trash2 size={14} /> Delete account
        </button>
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
