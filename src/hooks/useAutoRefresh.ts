"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

/**
 * Lightweight auto-refresh hook for dashboards.
 * - Polls every 5 minutes when the tab is visible.
 * - Refreshes immediately when the tab regains focus.
 * - Uses the existing store's refreshClips() to re-fetch clips from Supabase.
 */
export function useAutoRefresh(intervalMs = 5 * 60 * 1000) {
  const { refreshClips } = useStore();
  const lastRefresh = useRef(0);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastRefresh.current > 30_000) {
          lastRefresh.current = now;
          void refreshClips();
        }
      }
    }

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        lastRefresh.current = Date.now();
        void refreshClips();
      }
    }, intervalMs);

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshClips, intervalMs]);
}
