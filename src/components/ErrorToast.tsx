"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useStore } from "@/lib/store";

export function ErrorToast() {
  const { lastError, clearError } = useStore();

  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(() => clearError(), 8000);
    return () => clearTimeout(t);
  }, [lastError, clearError]);

  if (!lastError) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm animate-in slide-in-from-bottom-2">
      <div className="flex items-start gap-3 rounded-xl border border-red/20 bg-red-50 p-4 shadow-lg">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red" />
        <p className="flex-1 text-sm text-red">{lastError}</p>
        <button
          onClick={() => clearError()}
          className="shrink-0 rounded p-0.5 text-red/60 hover:text-red"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
