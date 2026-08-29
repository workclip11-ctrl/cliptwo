import type { UserProfile } from "./auth";

// The single seeded super-admin account. In production this would be enforced
// by Supabase RLS + a roles table; here we treat this account as having every
// admin permission and gate finer actions on it / on the user's permission set.
export const ADMIN_EMAIL = "workclip11@gmail.com";

export type AdminPermission =
  | "clipper.view"
  | "clipper.suspend"
  | "clipper.reactivate"
  | "clipper.verify"
  | "clipper.review_risk"
  | "clipper.notes"
  | "clipper.appeals";

/**
 * Returns whether the given admin user may perform `perm`.
 *
 * Enforcement model: the `/admin` route is already guarded by `AdminGuard`
 * (only `role === "admin"` can enter). Sensitive, destructive, or
 * trust-affecting actions are additionally gated on a concrete permission so
 * that a low-privilege admin (e.g. a read-only reviewer) cannot suspend
 * accounts, verify identities, or clear risk flags. The seeded super-admin
 * account holds every permission.
 */
export function canAdmin(user: UserProfile | null, perm: AdminPermission): boolean {
  if (!user || user.role !== "admin") return false;
  if (user.email === ADMIN_EMAIL) return true;
  return (user.permissions as AdminPermission[] | undefined)?.includes(perm) ?? false;
}
