-- ============================================================================
-- Campaign Launch Payment Integrity (Phase 4 Security Fix)
-- ============================================================================
-- Blocks creator from self-verifying launch_payment_status.
--
-- Invariant: launch_payment_status = 'verified' can ONLY be set by admin.
-- The verify_campaign_launch_payment() RPC is SECURITY DEFINER and runs with
-- the calling user's auth.uid(). When admin calls it, is_admin() returns true
-- and the trigger allows the UPDATE. When a creator tries a direct UPDATE,
-- is_admin() returns false and the trigger blocks it.
--
-- Also protects:
--   'submitted' → only campaign owner or admin
--   'rejected'  → only admin
--   'pending'   → never via UPDATE (only on INSERT via create_campaign)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_campaign_launch_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only care when launch_payment_status actually changes
  IF NEW.launch_payment_status IS DISTINCT FROM OLD.launch_payment_status THEN

    -- 'verified' can ONLY be set by admin (via verify_campaign_launch_payment RPC)
    IF NEW.launch_payment_status = 'verified' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admin can verify campaign launch payment';
    END IF;

    -- 'submitted' can be set by campaign owner (submit RPC) or admin
    IF NEW.launch_payment_status = 'submitted' THEN
      IF NEW.created_by != auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only the campaign owner can submit launch payment';
      END IF;
    END IF;

    -- 'rejected' can ONLY be set by admin (via reject_campaign_launch_payment RPC)
    IF NEW.launch_payment_status = 'rejected' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admin can reject campaign launch payment';
    END IF;

    -- 'pending' should NEVER be set via UPDATE (only on INSERT via create_campaign)
    IF NEW.launch_payment_status = 'pending' THEN
      RAISE EXCEPTION 'Cannot set launch payment status to pending via UPDATE';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_campaign_launch_payment_integrity ON public.campaigns;
CREATE TRIGGER enforce_campaign_launch_payment_integrity
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_launch_payment_integrity();
