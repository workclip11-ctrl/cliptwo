"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Save,
  Bell,
  Eye,
  Archive,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export default function CreatorSettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profiles, updateProfile, deactivateOwnAccount } = useStore();
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
    <div className="mx-auto max-w-[1120px] space-y-14 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
            Settings
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Manage your profile, notifications, and account.
          </p>
        </div>
        <button
          onClick={() => {
            signOut();
            router.push("/login");
          }}
          className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border/60 bg-card px-4 text-[14px] font-medium text-muted transition-colors duration-150 hover:border-foreground/20 hover:text-foreground"
        >
          <LogOut size={14} /> Log out
        </button>
      </div>

      {/* ── Profile ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[18px] font-bold tracking-tight">Profile</h2>
        <p className="mb-5 text-[14px] text-muted">
          Update the information shown to people working with you.
        </p>

        <div className="rounded-[12px] border border-border/40 bg-card p-5 sm:p-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-[20px] font-semibold text-white">
              {(user?.name?.[0] ?? "C").toUpperCase()}
            </span>

            {/* Fields */}
            <div className="min-w-0 flex-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-[14px]">
                  <span className="mb-1.5 block text-muted">Display name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 w-full rounded-[10px] border border-border/60 bg-background px-3.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
                  />
                </label>
                <label className="block text-[14px]">
                  <span className="mb-1.5 block text-muted">Email</span>
                  <input
                    value={user?.email ?? ""}
                    readOnly
                    className="h-11 w-full rounded-[10px] border border-border/60 bg-background px-3.5 text-[14px] text-muted outline-none"
                  />
                </label>
              </div>
              <label className="mt-4 block text-[14px]">
                <span className="mb-1.5 block text-muted">Bio</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell clippers about your brand…"
                  rows={3}
                  className="w-full resize-none rounded-[10px] border border-border/60 bg-background px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Save — directly under Profile */}
        <div className="mt-4">
          <button
            onClick={save}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-foreground/90"
          >
            <Save size={14} /> {saved ? "Saved" : "Save changes"}
          </button>
        </div>
      </section>

      {/* ── Notifications ───────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[18px] font-bold tracking-tight">
          Notifications
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Choose which updates you receive.
        </p>

        <div className="divide-y divide-border/40 rounded-[12px] border border-border/40 bg-card">
          {[
            {
              label: "Email notifications",
              desc: "Receive updates via email",
              val: emailNotifs,
              set: setEmailNotifs,
              icon: Bell,
            },
            {
              label: "Push notifications",
              desc: "Browser push alerts",
              val: pushNotifs,
              set: setPushNotifs,
              icon: Bell,
            },
            {
              label: "Campaign updates",
              desc: "New submissions on your campaigns",
              val: campaignAlerts,
              set: setCampaignAlerts,
              icon: Eye,
            },
            {
              label: "Submission alerts",
              desc: "When a clip is submitted or reviewed",
              val: submissionAlerts,
              set: setSubmissionAlerts,
              icon: Bell,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between px-5 py-4"
            >
              <div className="flex items-center gap-3.5">
                <item.icon size={16} className="text-muted" />
                <div>
                  <p className="text-[15px] font-medium">{item.label}</p>
                  <p className="text-[13px] text-muted">{item.desc}</p>
                </div>
              </div>
              <button
                onClick={() => item.set(!item.val)}
                aria-label={`Toggle ${item.label}`}
                className="cursor-pointer text-muted transition-colors hover:text-foreground"
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

      {/* ── Deactivate account ──────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[18px] font-bold tracking-tight">
          Deactivate account
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Permanently deactivate your account and remove access.
        </p>

        <div className="rounded-[12px] border border-amber/30 bg-amber/5 p-5 sm:p-6">
          <p className="text-[14px] leading-relaxed text-foreground/80">
            Deactivating your account will anonymize your profile data and block
            future logins. Your financial and audit records will be preserved for
            compliance purposes.
          </p>
          <button
            onClick={async () => {
              if (
                !confirm(
                  "Deactivate your account?\n\nThis will:\n- Anonymize your profile (name, email, etc.)\n- Block future logins\n- Preserve financial records for compliance\n\nThis action cannot be undone.",
                )
              )
                return;
              await deactivateOwnAccount();
              await signOut();
              router.push("/");
            }}
            className="mt-4 inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[10px] border border-red/30 px-5 text-[14px] font-medium text-red transition-colors duration-150 hover:bg-red/5"
          >
            <Archive size={14} /> Deactivate account
          </button>
        </div>
      </section>
    </div>
  );
}
