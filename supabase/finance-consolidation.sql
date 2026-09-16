-- ============================================================================
-- FINANCE CONSOLIDATION MIGRATION
--
-- This migration completes the transition from the legacy financial architecture
-- (earnings, payouts, wallet_ledger-as-source-of-truth) to the new authoritative
-- architecture (financial_records, payout_requests).
--
-- Run AFTER: schema.sql, admin-schema.sql, financial-rewrite.sql
-- Run BEFORE: integrity-constraints.sql
--
-- Changes:
-- 1. update_clip_status: remove legacy financial columns and earnings creation
-- 2. admin_clip_action: restrict to moderation-only actions (approve/reject/hold)
-- 3. admin_user_action: reference financial_records/payout_requests for delete check
-- 4. adjust_campaign_budget: use financial_records instead of earnings
-- 5. clips.status CHECK: enforce moderation-only statuses
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Fix update_clip_status — remove legacy financial columns and earnings ref
--
-- This function is called by admin_clip_action for reject/hold operations.
-- Approve now goes through approve_clip() which creates financial_records.
-- We remove: failure_reason, txn_id, payout_ref parameters and the
-- earnings/create_earning block.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_clip_status(
  p_clip_id uuid,
  p_status text,
  p_rejection_reason text DEFAULT NULL,
  p_rejection_details text DEFAULT NULL,
  p_held_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip record;
  v_actor uuid;
  v_is_admin boolean;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_admin := public.is_admin();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can update clip status';
  END IF;

  -- Moderation-only statuses (financial state lives in financial_records)
  -- 'approved' is excluded: only approve_clip() can set that status.
  IF p_status NOT IN ('pending', 'rejected', 'held') THEN
    RAISE EXCEPTION 'Invalid status: %. Only pending, rejected, held are allowed. Use approve_clip() for approval.', p_status;
  END IF;

  SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clip not found';
  END IF;

  UPDATE public.clips SET
    status = p_status,
    rejection_reason = COALESCE(p_rejection_reason, rejection_reason),
    rejection_details = COALESCE(p_rejection_details, rejection_details),
    held_reason = COALESCE(p_held_reason, held_reason),
    updated_at = now(),
    audit = COALESCE(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'status_changed',
      'by', (SELECT email FROM public.profiles WHERE id = v_actor),
      'at', now(),
      'from', v_clip.status,
      'to', p_status
    )
  WHERE id = p_clip_id
  RETURNING to_jsonb(clips.*) INTO v_clip;

  -- NOTE: Financial record creation for approved clips is handled by approve_clip().
  -- This function only handles moderation status changes (reject, hold).

  RETURN v_clip;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_clip_status(uuid, text, text, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Fix admin_clip_action — restrict to moderation-only actions
--
-- Financial actions (payable, processing, paid, failed, retry, release, revert)
-- are removed. Clip approval goes through approve_clip() which creates
-- financial_records atomically. This function now only handles:
--   reject  → sets clip to rejected
--   hold    → sets clip to held
--
-- SUPERSEDED: This definition is historical/legacy. The authoritative version
-- is in security-hardening-migration.sql which runs later in execution order.
-- Do NOT re-execute this definition as it would overwrite the hardened version.
-- ────────────────────────────────────────────────────────────────────────────

-- [DEFINITION REMOVED] This function is defined in security-hardening-migration.sql

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Fix admin_user_action — reference financial_records/payout_requests
--
-- SUPERSEDED: This definition is historical/legacy. The authoritative version
-- is in security-hardening-migration.sql which runs later in execution order.
-- Do NOT re-execute this definition as it would overwrite the hardened version.
-- ────────────────────────────────────────────────────────────────────────────

-- [DEFINITION REMOVED] This function is defined in security-hardening-migration.sql

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Fix adjust_campaign_budget — use financial_records instead of earnings
--
-- SUPERSEDED: This definition is historical/legacy. The authoritative version
-- is in security-hardening-migration.sql which runs last in execution order.
-- Do NOT re-execute this definition as it would overwrite the hardened version.
-- ────────────────────────────────────────────────────────────────────────────

-- [DEFINITION REMOVED] This function is defined in security-hardening-migration.sql

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Fix clips.status CHECK — enforce moderation-only statuses
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_status_check;
  ALTER TABLE public.clips ADD CONSTRAINT clips_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'held'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
