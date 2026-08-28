"use client";

import { Users, Ban, Check, Trash2 } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { useStore } from "@/lib/store";
import { rup, clipEarnings } from "@/lib/format";

export default function AdminClippers() {
  const { profiles, clips, campaigns, updateProfileStatus, deleteProfile } =
    useStore();
  const clippers = profiles.filter((p) => p.role === "clipper");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clippers</h1>
        <p className="mt-1 text-sm text-muted">
          {clippers.length} clipper account{clippers.length === 1 ? "" : "s"}.
        </p>
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
                    <StatusPill status={suspended ? "rejected" : "approved"} />
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
                  No clipper accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
