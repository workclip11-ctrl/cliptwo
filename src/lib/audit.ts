import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { AuditLog, AuditAction } from "@/lib/types";

const STORAGE_KEY = "cliptwo:audit-logs";

// ── In-memory store ──────────────────────────────────────────────────────────
let _logs: AuditLog[] = [];
let _listeners: Array<() => void> = [];

function emit() {
  for (const fn of _listeners) fn();
}

function loadLocal(): AuditLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuditLog[]) : [];
  } catch {
    return [];
  }
}

function persistLocal() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_logs));
  } catch {
    /* quota exceeded — ignore */
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getAuditLogs(): AuditLog[] {
  return _logs;
}

export function subscribeAuditLogs(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((x) => x !== fn);
  };
}

export function initAuditLogs(): void {
  _logs = loadLocal().sort((a, b) => b.timestamp - a.timestamp);
}

export function appendAuditLog(
  entry: Omit<AuditLog, "id" | "timestamp">,
): AuditLog {
  const log: AuditLog = {
    ...entry,
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  _logs = [log, ..._logs];
  persistLocal();
  emit();

  // Persist to Supabase if configured (fire-and-forget)
  if (isSupabaseConfigured) {
    ignore(
      supabase.from("audit_logs").insert({
        id: log.id,
        timestamp: new Date(log.timestamp).toISOString(),
        actor: log.actor,
        action: log.action,
        target_type: log.targetType,
        target_id: log.targetId,
        target_label: log.targetLabel ?? null,
        previous_value: log.previousValue ?? null,
        new_value: log.newValue ?? null,
        reason: log.reason ?? null,
      }),
    );
  }

  return log;
}

export function searchAuditLogs(opts: {
  q?: string;
  action?: AuditAction | "";
  targetType?: string;
  actor?: string;
  from?: number;
  to?: number;
}): AuditLog[] {
  let result = _logs;

  if (opts.q) {
    const needle = opts.q.toLowerCase();
    result = result.filter(
      (l) =>
        l.actor.toLowerCase().includes(needle) ||
        l.action.toLowerCase().includes(needle) ||
        l.targetId.toLowerCase().includes(needle) ||
        (l.targetLabel ?? "").toLowerCase().includes(needle) ||
        (l.reason ?? "").toLowerCase().includes(needle) ||
        (l.previousValue ?? "").toLowerCase().includes(needle) ||
        (l.newValue ?? "").toLowerCase().includes(needle),
    );
  }

  if (opts.action) {
    result = result.filter((l) => l.action === opts.action);
  }

  if (opts.targetType) {
    result = result.filter((l) => l.targetType === opts.targetType);
  }

  if (opts.actor) {
    const needle = opts.actor.toLowerCase();
    result = result.filter((l) => l.actor.toLowerCase().includes(needle));
  }

  if (opts.from) {
    result = result.filter((l) => l.timestamp >= opts.from!);
  }

  if (opts.to) {
    result = result.filter((l) => l.timestamp <= opts.to!);
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ignore(_: unknown) {
  /* fire-and-forget */
}

// ── Action label map ─────────────────────────────────────────────────────────

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  user_created: "User created",
  user_suspended: "User suspended",
  user_reactivated: "User reactivated",
  user_verified: "User verified",
  user_unverified: "User unverified",
  campaign_created: "Campaign created",
  campaign_edited: "Campaign edited",
  campaign_paused: "Campaign paused",
  campaign_ended: "Campaign ended",
  campaign_closed: "Campaign closed",
  clip_approved: "Clip approved",
  clip_rejected: "Clip rejected",
  clip_held: "Clip held",
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

export const AUDIT_TARGET_TYPES = [
  "user",
  "campaign",
  "clip",
  "system",
  "fraud",
] as const;
