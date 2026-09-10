-- ============================================================================
-- Campaign Budget Lock (Phase 3)
-- ============================================================================
-- Prevents the campaign budget from being changed once launch payment has
-- been submitted or verified. This closes the attack vector where a Creator
-- pays for a ₹40K budget, then silently raises it to ₹80K via RPC.
--
-- Rules enforced by BEFORE UPDATE trigger on campaigns:
--   launch_payment_status = 'pending'   → budget change ALLOWED
--   launch_payment_status = 'submitted' → budget change BLOCKED
--   launch_payment_status = 'verified'  → budget change BLOCKED
--   launch_payment_status = 'rejected'  → budget change ALLOWED
--
-- Applies to ALL UPDATE paths: update_campaign(), adjust_campaign_budget(),
-- and any direct UPDATE on the campaigns table.
-- ============================================================================

-- 1. Trigger function
CREATE OR REPLACE FUNCTION public.enforce_campaign_budget_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when budget actually changes
  IF NEW.budget IS DISTINCT FROM OLD.budget THEN
    -- Block if payment has reached the protected stage
    IF OLD.launch_payment_status IN ('submitted', 'verified') THEN
      RAISE EXCEPTION
        'Cannot change campaign budget: launch payment is %. '
        'Reject the current payment first, then adjust the budget and resubmit.',
        OLD.launch_payment_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. BEFORE UPDATE trigger (fires on every UPDATE to campaigns)
DROP TRIGGER IF EXISTS trg_enforce_campaign_budget_lock ON public.campaigns;
CREATE TRIGGER trg_enforce_campaign_budget_lock
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_budget_lock();
