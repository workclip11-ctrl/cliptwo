"use client";

import { useMemo, useState } from "react";
import { Ban, Check, Trash2, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { rup, clipEarnings } from "@/lib/format";

function StatusBadge({ suspended }: { suspended: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        suspended
          ? "bg-red/10 text-red border-red/20"
          : "bg-green/10 text-green border-green/20"
      }`}
    >
      {suspended ? "Suspended" : "Active"}
    </span>
  );
}

export default function AdminClippers() {
  const { profiles, clips, campaigns, updateProfileStatus, deleteProfile } =
    useStore();
  const [q, setQ] = useState("");
  const clippers = useMemo(
    () =>
      profiles
        .filter((p) => p.role === "clipper")
        .filter(
          (p) =>
            !q ||
            p.name.toLowerCase().includes(q.toLowerCase()) ||
            p.email.toLowerCase().includes(q.toLowerCase()),
        ),
    [profiles, q],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clippers</h1>
        <p className="mt-1 text-sm text-muted">
          {clippers.length} clipper account{clippers.length === 1 ? "" : "s"}
          {q ? " (filtered)" : ""}.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email"
          className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 text-right font-medium">Clips</th>
              <th className="px-4 py-3 text-right font-medium">Earned</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {clippers.map((p) => {
              const own = clips.filter((k) => k.userId === p.id);
              const earned = own.reduce(
                (s, k) => s + clipEarnings(k, campaigns),
                0,
              );
              const suspended = p.status === "suspended";
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted">{p.email}</td>
                  <td className="px-4 py-3 text-right font-mono">{own.length}</td>
                  <td className="px-4 py-3 text-right font-mono">{rup(earned)}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge suspended={suspended} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() =>
                          updateProfileStatus(p.id, suspended ? "active" : "suspended")
                        }
                        title={suspended ? "Activate" : "Suspend"}
                        className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent-soft"
                      >
                        {suspended ? <Check size={13} /> : <Ban size={13} />}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete clipper ${p.name}?`))
                            deleteProfile(p.id);
                        }}
                        title="Delete"
                        className="rounded-md border px-2 py-1 text-xs font-medium text-red hover:bg-red-500/10"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {clippers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No clipper accounts{profiles.length ? " matching your search" : " yet"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
