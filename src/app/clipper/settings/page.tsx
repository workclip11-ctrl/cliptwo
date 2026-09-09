"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Save,
  Bell,
  Eye,
  Link2,
  Archive,
  ArrowRight,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export default function ClipperSettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profiles, updateProfile, deactivateOwnAccount } = useStore();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [earningsAlerts, setEarningsAlerts] = useState(true);
  const [campaignUpdates, setCampaignUpdates] = useState(true);
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
    <div className="mx-auto max-w-[1120px] space-y-10 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[30px]">
            Settings
          </h1>
          <p className="mt-2 text-[14px] text-muted sm:text-[15px]">
            Manage your profile, notifications, and account.
          </p>
        </div>
        <button
          onClick={() => {
            signOut();
            router.push("/login");
          }}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border px-4 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-foreground"
        >
          <LogOut size={14} /> Log out
        </button>
      </div>

      {/* ── Profile ─────────────────────────────────────── */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Profile
        </h2>
        <div className="mt-4 rounded-[12px] border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {/* Avatar */}
            <div className="shrink-0">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-xl font-semibold text-white">
                {(user?.name?.[0] ?? "C").toUpperCase()}
              </span>
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-[14px]">
                  <span className="text-muted">Display name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-[10px] border bg-background px-3.5 text-[14px] outline-none transition-colors placeholder:text-muted/50 focus:border-foreground"
                  />
                </label>
                <label className="block text-[14px]">
                  <span className="text-muted">Email</span>
                  <input
                    value={user?.email ?? ""}
                    readOnly
                    className="mt-1.5 h-11 w-full rounded-[10px] border bg-background px-3.5 text-[14px] text-muted outline-none"
                  />
                </label>
              </div>
              <label className="block text-[14px]">
                <span className="text-muted">Bio</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell creators about yourself…"
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-[10px] border bg-background px-3.5 py-3 text-[14px] outline-none transition-colors placeholder:text-muted/50 focus:border-foreground"
                />
              </label>
            </div>
          </div>

          {/* Save action — directly after profile */}
          <div className="mt-5 flex items-center gap-3 border-t border-border/50 pt-5">
            <button
              onClick={save}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              <Save size={14} /> {saved ? "Saved" : "Save changes"}
            </button>
            {saved && (
              <span className="text-[13px] text-green">Profile updated</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Notifications ───────────────────────────────── */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Notifications
        </h2>
        <p className="mt-1 text-[14px] text-muted">
          Choose what updates you receive.
        </p>
        <div className="mt-4 divide-y divide-border/50 rounded-[12px] border bg-card">
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
              label: "Earnings alerts",
              desc: "When a clip is approved or paid",
              val: earningsAlerts,
              set: setEarningsAlerts,
              icon: Eye,
            },
            {
              label: "Campaign updates",
              desc: "New campaigns and deadline reminders",
              val: campaignUpdates,
              set: setCampaignUpdates,
              icon: Bell,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <item.icon size={16} className="text-muted" />
                <div>
                  <p className="text-[14px] font-medium">{item.label}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{item.desc}</p>
                </div>
              </div>
              <button
                onClick={() => item.set(!item.val)}
                aria-label={`Toggle ${item.label}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent-soft"
              >
                {item.val ? (
                  <ToggleRight size={28} className="text-green" />
                ) : (
                  <ToggleLeft size={28} className="text-muted" />
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Account ─────────────────────────────────────── */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Account
        </h2>
        <div className="mt-4 divide-y divide-border/50 rounded-[12px] border bg-card">
          <Link
            href="/clipper/accounts"
            className="group flex items-center justify-between px-5 py-4 transition-colors duration-150 hover:bg-accent-soft/50"
          >
            <div className="flex items-center gap-3">
              <Link2 size={16} className="text-muted" />
              <div>
                <p className="text-[14px] font-medium">Connected accounts</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  Manage your social connections
                </p>
              </div>
            </div>
            <ArrowRight
              size={16}
              className="text-muted transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="/clipper/wallet"
            className="group flex items-center justify-between px-5 py-4 transition-colors duration-150 hover:bg-accent-soft/50"
          >
            <div className="flex items-center gap-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted"
              >
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
              <div>
                <p className="text-[14px] font-medium">Wallet &amp; payouts</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  View earnings and payout settings
                </p>
              </div>
            </div>
            <ArrowRight
              size={16}
              className="text-muted transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </section>

      {/* ── Danger Zone ─────────────────────────────────── */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-red">
          Danger zone
        </h2>
        <div className="mt-4 rounded-[12px] border border-red/20 bg-card p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold">Deactivate account</h3>
          <p className="mt-1.5 max-w-lg text-[14px] leading-relaxed text-muted">
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
            className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-red/30 px-4 text-[14px] font-medium text-red transition-colors duration-150 hover:bg-red/5"
          >
            <Archive size={14} /> Deactivate account
          </button>
        </div>
      </section>
    </div>
  );
}
