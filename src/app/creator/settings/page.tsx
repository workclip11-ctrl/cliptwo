"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, BadgeCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function CreatorSettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [upi, setUpi] = useState("");
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Manage your profile and payout details.
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </label>
        </div>
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
        onClick={() => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        {saved ? "Saved" : "Save changes"}
      </button>
    </div>
  );
}
