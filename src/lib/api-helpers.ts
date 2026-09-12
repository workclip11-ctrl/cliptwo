// ---------------------------------------------------------------------------
// Shared API helpers for route handlers
// ---------------------------------------------------------------------------

/**
 * Sanitize RPC/database error messages before returning to clients.
 * Prevents leaking internal details: table names, column names, constraint
 * names, function signatures, and SQL query structure.
 */
export function sanitizeError(raw: string | null | undefined): string {
  if (!raw) return "Operation failed";

  const msg = raw.toLowerCase();

  // Map known RPC error patterns to safe user-facing messages
  if (msg.includes("not authenticated")) return "Not authenticated";
  if (msg.includes("not authorized") || msg.includes("access denied"))
    return "Access denied";
  if (msg.includes("only admins") || msg.includes("admin access required"))
    return "Admin access required";
  if (msg.includes("only active creators")) return "Only active creators can perform this action";
  if (msg.includes("campaign not found")) return "Campaign not found";
  if (msg.includes("clip not found")) return "Clip not found";
  if (msg.includes("user not found")) return "User not found";
  if (msg.includes("payment not found")) return "Payment not found";
  if (msg.includes("launch payment has not been verified"))
    return "Launch payment has not been verified";
  if (msg.includes("can only publish a draft")) return "Campaign is not in draft status";
  if (msg.includes("can only pause an open")) return "Campaign is not open";
  if (msg.includes("can only resume a paused")) return "Campaign is not paused";
  if (msg.includes("can only close an open or paused")) return "Campaign is not open or paused";
  if (msg.includes("can only reopen a closed")) return "Campaign is not closed";
  if (msg.includes("cannot pause") || msg.includes("cannot resume"))
    return "Invalid campaign state for this action";
  if (msg.includes("payment is not in submitted status"))
    return "Payment is not in a submittable state";
  if (msg.includes("already verified")) return "Payment already verified";
  if (msg.includes("only the campaign owner")) return "Only the campaign owner can perform this action";
  if (msg.includes("cannot change campaign owner"))
    return "Campaign ownership cannot be changed";
  if (msg.includes("missing permission")) return "Insufficient permissions";
  if (msg.includes("invalid action")) return "Invalid action";
  if (msg.includes("invalid status")) return "Invalid status value";
  if (msg.includes("status must be")) return "Invalid status value";
  if (msg.includes("budget cannot be negative")) return "Budget cannot be negative";
  if (msg.includes("cannot be lower than committed")) return "Budget is below current spend";
  if (msg.includes("already has a pending") || msg.includes("already has a processing"))
    return "A payout request is already being processed";
  if (msg.includes("insufficient balance")) return "Insufficient balance";
  if (msg.includes("below the minimum")) return "Amount below minimum threshold";
  if (msg.includes("platform not configured")) return "Platform not configured";
  if (msg.includes("token has expired")) return "Social connection token has expired";
  if (msg.includes("connection not found")) return "Social connection not found";
  if (msg.includes("account not found")) return "Social account not found";
  if (msg.includes("sync already in progress")) return "Sync already in progress";

  // For unrecognized errors, return a generic message
  // Do NOT leak the raw error which may contain SQL internals
  return "Operation failed";
}
