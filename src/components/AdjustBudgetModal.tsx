"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { rup } from "@/lib/format";
import type { Campaign } from "@/lib/types";

export function AdjustBudgetModal({
  campaign,
  currentSpend,
  onClose,
  onSave,
}: {
  campaign: Campaign;
  currentSpend: number;
  onClose: () => void;
  onSave: (budget: number, note: string) => void;
}) {
  const [budget, setBudget] = useState(String(campaign.budget ?? 0));
  const [error, setError] = useState("");

  const handleSave = () => {
    const b = Number(budget) || 0;
    if (b < currentSpend) {
      setError(
        `Budget can't be lower than the amount already spent (${rup(currentSpend)}). Raise it or it would exceed the configured cap.`,
      );
      return;
    }
    onSave(b, `Budget adjusted to ${rup(b)}`);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Adjust budget</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <p className="mt-2 text-sm text-muted">
          Spent so far: <span className="font-medium text-foreground">{rup(currentSpend)}</span>.
          Budget can only be raised above what&apos;s already spent — a campaign may
          not spend beyond its configured budget.
        </p>

        <label className="mt-4 block text-sm font-medium">New budget (₹)</label>
        <input
          type="number"
          min={0}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        {error && <p className="mt-1 text-xs text-red">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-accent-soft"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Save budget
          </button>
        </div>
      </div>
    </div>
  );
}
