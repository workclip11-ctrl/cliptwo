// ---------------------------------------------------------------------------
// Audit Log — single authoritative source: database audit_logs table.
//
// localStorage is NOT an authoritative audit source. All audit records live
// in the database, written server-side by write_admin_audit() RPC.
//
// This module provides:
// - Reading audit logs from the database
// - Subscribing to changes (polling-based)
// - Searching/filtering
// ---------------------------------------------------------------------------

import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

// ── Database audit log row (matches the new audit_logs schema) ──────────────

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor_id: string | null;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  idempotency_key: string | null;
}

// ── State ───────────────────────────────────────────────────────────────────

let _logs: AuditLogEntry[] = [];
let _listeners: Array<() => void> = [];
let _loading = false;

function emit() {
  for (const fn of _listeners) fn();
}

// ── Fetch audit logs from database ──────────────────────────────────────────

export async function fetchAuditLogs(opts?: {
  q?: string;
  action?: string;
  entity_type?: string;
  actor?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogEntry[]> {
  if (!isSupabaseConfigured) return [];

  _loading = true;
  try {
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(opts?.limit ?? 100);

    if (opts?.action) {
      query = query.eq("action", opts.action);
    }
    if (opts?.entity_type) {
      query = query.eq("entity_type", opts.entity_type);
    }
    if (opts?.actor) {
      query = query.ilike("actor", `%${opts.actor}%`);
    }
    if (opts?.q) {
      const needle = `%${opts.q}%`;
      query = query.or(
        `actor.ilike.${needle},action.ilike.${needle},entity_id.ilike.${needle},entity_label.ilike.${needle}`,
      );
    }
    if (opts?.offset) {
      query = query.range(opts.offset, (opts.offset ?? 0) + (opts?.limit ?? 100) - 1);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Failed to fetch audit logs:", error.message);
      return [];
    }

    _logs = (data as AuditLogEntry[]) ?? [];
    emit();
    return _logs;
  } finally {
    _loading = false;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getAuditLogs(): AuditLogEntry[] {
  return _logs;
}

export function isLoading(): boolean {
  return _loading;
}

export function subscribeAuditLogs(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((x) => x !== fn);
  };
}

// Initialize: fetch from database
export async function initAuditLogs(): Promise<void> {
  await fetchAuditLogs();
}

// ── Search (client-side on cached data) ─────────────────────────────────────

export function searchAuditLogs(opts: {
  q?: string;
  action?: string;
  entity_type?: string;
  actor?: string;
  from?: number;
  to?: number;
}): AuditLogEntry[] {
  let result = _logs;

  if (opts.q) {
    const needle = opts.q.toLowerCase();
    result = result.filter(
      (l) =>
        l.actor.toLowerCase().includes(needle) ||
        l.action.toLowerCase().includes(needle) ||
        l.entity_id.toLowerCase().includes(needle) ||
        (l.entity_label ?? "").toLowerCase().includes(needle) ||
        JSON.stringify(l.metadata ?? {}).toLowerCase().includes(needle) ||
        JSON.stringify(l.before_state ?? {}).toLowerCase().includes(needle) ||
        JSON.stringify(l.after_state ?? {}).toLowerCase().includes(needle),
    );
  }

  if (opts.action) {
    result = result.filter((l) => l.action === opts.action);
  }

  if (opts.entity_type) {
    result = result.filter((l) => l.entity_type === opts.entity_type);
  }

  if (opts.actor) {
    const needle = opts.actor.toLowerCase();
    result = result.filter((l) => l.actor.toLowerCase().includes(needle));
  }

  if (opts.from) {
    result = result.filter(
      (l) => new Date(l.timestamp).getTime() >= opts.from!,
    );
  }

  if (opts.to) {
    result = result.filter(
      (l) => new Date(l.timestamp).getTime() <= opts.to!,
    );
  }

  return result;
}

// ── Action label map ────────────────────────────────────────────────────────

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  user_created: "User created",
  user_suspended: "User suspended",
  user_reactivated: "User reactivated",
  user_verified: "User verified",
  user_unverified: "User unverified",
  user_suspend: "User suspended",
  user_reactivate: "User reactivated",
  user_verify: "User verified",
  user_unverify: "User unverified",
  user_set_risk: "Risk flagged",
  user_clear_risk: "Risk cleared",
  user_save_notes: "Admin notes",
  user_delete: "User deleted",
  campaign_created: "Campaign created",
  campaign_edited: "Campaign edited",
  campaign_paused: "Campaign paused",
  campaign_resume: "Campaign resumed",
  campaign_end: "Campaign ended",
  campaign_close: "Campaign closed",
  campaign_reopen: "Campaign reopened",
  campaign_delete: "Campaign deleted",
  clip_approved: "Clip approved",
  clip_rejected: "Clip rejected",
  clip_held: "Clip held",
  clip_approve: "Clip approved",
  clip_reject: "Clip rejected",
  clip_hold: "Clip held",
  clip_processing: "Payout processing",
  clip_paid: "Clip paid",
  clip_failed: "Payout failed",
  clip_retry: "Payout retried",
  clip_release: "Clip released",
  clip_revert: "Clip reverted",
  earnings_adjusted: "Earnings adjusted",
  payout_initiated: "Payout initiated",
  payout_completed: "Payout completed",
  payout_failed: "Payout failed",
  fraud_flag_created: "Fraud flag created",
  fraud_flag_cleared: "Fraud flag cleared",
  account_changed: "Account changed",
  permission_changed: "Permission changed",
  admin_notes: "Admin notes",
  appeal_response: "Appeal response",
  risk_flagged: "Risk flagged",
  risk_cleared: "Risk cleared",
  other: "Other",
};

export const AUDIT_ENTITY_TYPES = [
  "user",
  "campaign",
  "clip",
  "system",
  "fraud",
  "payout",
  "earning",
] as const;
