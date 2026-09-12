"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { rup } from "@/lib/format";
import { useFocusTrap } from "@/lib/use-focus-trap";
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
  onSave: (budget: number, note: string) => Promise<void> | void;
}) {
  const [budget, setBudget] = useState(String(campaign.budget ?? 0));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { containerRef, onKeyDown } = useFocusTrap(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async () => {
    const b = Number(budget) || 0;
    if (b < currentSpend) {
      setError(
        `Budget can't be lower than the amount already spent (${rup(currentSpend)}). Raise it or it would exceed the configured cap.`,
      );
      return;
    }
    setSaving(true);
    try {
      await onSave(b, `Budget adjusted to ${rup(b)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex cursor-pointer items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjust-budget-title"
    >
      <div
        ref={containerRef}
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-2xl border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="adjust-budget-title" className="text-lg font-semibold">Adjust budget</h3>
          <button onClick={onClose} aria-label="Close" className="cursor-pointer text-muted hover:text-foreground">
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
            disabled={saving}
            className="rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : null}
            Save budget
          </button>
        </div>
      </div>
    </div>
  );
}
