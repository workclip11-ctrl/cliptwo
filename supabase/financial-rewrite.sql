-- ===========================================================================
-- FINANCIAL ARCHITECTURE REWRITE
--
-- Separates clip moderation status from financial status.
-- Creates authoritative financial_records and payout_requests tables.
-- Migrates existing data. Safe to run once on existing databases.
--
-- FINANCIAL SEMANTICS (single source of truth):
--
-- financial_records.status = Earning lifecycle:
--   pending    = Clip approved, earning calculated, awaiting finalization
--   processing = Finalized, available for withdrawal
--   paid       = Included in a completed payout request (permanently consumed)
--
-- payout_requests.status = Actual UPI payment lifecycle:
--   pending    = Clipper requested withdrawal
--   processing = Admin initiated UPI payment
--   paid       = Admin confirmed UPI payment (money sent to clipper)
--
-- Wallet balance = sum(processing records) - sum(all active payout requests)
-- ===========================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: Create financial_records table
-- Immutable financial records created when admin approves a clip.
-- Contains the complete payment lifecycle.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id             uuid NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  campaign_id         uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  clipper_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Immutable financial values (calculated at approval time, integer paise)
  locked_cpm          integer NOT NULL,           -- CPM in paise (₹220 = 22000)
  locked_max_payout   integer,                    -- Max payout per clip in paise
  verified_views      integer NOT NULL DEFAULT 0,  -- Views used for calculation
  gross_amount        integer NOT NULL,            -- In paise: (views / 1000) * cpm
  platform_fee        integer NOT NULL,            -- In paise: 10% of gross
  net_amount          integer NOT NULL,            -- In paise: gross - platform_fee
  -- Payment lifecycle (earning finalization, NOT UPI payment)
  -- pending    = awaiting finalization
  -- processing = finalized, available for withdrawal
  -- paid       = included in a completed payout (permanently consumed)
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid')),
  upi_id_snapshot     text,                        -- UPI at time of payment
  payment_reference   text,                        -- Manual payment reference (NEFT/ref no)
  paid_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  processing_at       timestamptz,
  paid_at             timestamptz,
  -- Audit trail
  audit               jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS financial_records_clip_idx ON public.financial_records(clip_id);
CREATE INDEX IF NOT EXISTS financial_records_campaign_idx ON public.financial_records(campaign_id);
CREATE INDEX IF NOT EXISTS financial_records_clipper_idx ON public.financial_records(clipper_id);
CREATE INDEX IF NOT EXISTS financial_records_status_idx ON public.financial_records(status);

-- RLS: clipper sees own, creator sees on their campaigns, admin sees all
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_records_select" ON public.financial_records;
CREATE POLICY "financial_records_select" ON public.financial_records
  FOR SELECT USING (
    auth.uid() = clipper_id
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.created_by = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: admin-only (all mutations go through RPCs)
DROP POLICY IF EXISTS "financial_records_insert" ON public.financial_records;
CREATE POLICY "financial_records_insert" ON public.financial_records
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "financial_records_update" ON public.financial_records;
CREATE POLICY "financial_records_update" ON public.financial_records
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "financial_records_delete" ON public.financial_records;
CREATE POLICY "financial_records_delete" ON public.financial_records
  FOR DELETE USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: Create payout_requests table
-- Clipper-initiated payout requests. Admin processes manually via UPI.
-- This is the ONLY authoritative record of actual money paid to clipper.
-- Status: pending → processing → paid (no rejected/failed state)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount              integer NOT NULL,              -- Total requested in paise
  net_amount          integer NOT NULL,              -- Net after fees in paise
  currency            text NOT NULL DEFAULT 'INR',
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid')),
  method              text NOT NULL DEFAULT 'upi',
  upi_id              text NOT NULL,                 -- Snapshot of UPI at request time
  payment_reference   text,                          -- Admin-provided reference
  paid_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  processing_at       timestamptz,
  paid_at             timestamptz,
  finance_record_ids  uuid[] NOT NULL DEFAULT '{}',  -- Which records this payout covers
  audit               jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS payout_requests_user_idx ON public.payout_requests(user_id);
CREATE INDEX IF NOT EXISTS payout_requests_status_idx ON public.payout_requests(status);

-- GIN index on finance_record_ids for uniqueness checks
CREATE INDEX IF NOT EXISTS payout_requests_finance_record_ids_idx
  ON public.payout_requests USING gin (finance_record_ids);

-- RLS: user sees own, admin sees all
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_requests_select" ON public.payout_requests;
CREATE POLICY "payout_requests_select" ON public.payout_requests
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- INSERT: user can request their own payout
DROP POLICY IF EXISTS "payout_requests_insert" ON public.payout_requests;
CREATE POLICY "payout_requests_insert" ON public.payout_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: admin-only (status changes, payment reference)
DROP POLICY IF EXISTS "payout_requests_update" ON public.payout_requests;
CREATE POLICY "payout_requests_update" ON public.payout_requests
  FOR UPDATE USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: Update clips table — restrict status to moderation only
-- Remove financial statuses from clips. Financial state lives in financial_records.
-- ────────────────────────────────────────────────────────────────────────────

-- Drop old financial columns from clips (they belong in financial_records)
DO $$ BEGIN
  ALTER TABLE public.clips DROP COLUMN IF EXISTS txn_id;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.clips DROP COLUMN IF EXISTS payout_ref;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.clips DROP COLUMN IF EXISTS payout_date;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.clips DROP COLUMN IF EXISTS failure_reason;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: Migrate existing earnings data → financial_records
-- Map: earnings.status pending→pending, approved→pending, paid→paid
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    INSERT INTO public.financial_records (
      clip_id, campaign_id, clipper_id,
      locked_cpm, locked_max_payout, verified_views,
      gross_amount, platform_fee, net_amount,
      status, created_at, paid_at, audit
    )
    SELECT
      e.clip_id, e.campaign_id, e.clipper_id,
      e.locked_cpm, NULL, e.verified_views,
      e.gross_amount, e.platform_fee, e.net_amount,
      CASE
        WHEN e.status = 'paid' THEN 'paid'
        WHEN e.status IN ('approved', 'pending') THEN 'pending'
        ELSE 'pending'
      END,
      e.created_at,
      e.paid_at,
      e.audit
    FROM public.earnings e
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5: Migrate existing payouts → payout_requests
-- Map: payouts.status requested→pending, processing→processing, paid→paid
-- Remove: failed, reversed (not supported in new architecture)
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payouts') THEN
    INSERT INTO public.payout_requests (
      user_id, amount, net_amount, currency, status, method, upi_id,
      payment_reference, created_at, processing_at, paid_at,
      finance_record_ids, audit
    )
    SELECT
      p.user_id, p.amount, p.net_amount, p.currency,
      CASE
        WHEN p.status = 'paid' THEN 'paid'
        WHEN p.status = 'processing' THEN 'processing'
        WHEN p.status IN ('requested', 'pending') THEN 'pending'
        ELSE 'pending'
      END,
      COALESCE(p.method, 'upi'),
      COALESCE(p.upi_id, ''),
      p.provider_ref,
      p.requested_at,
      p.processed_at,
      p.paid_at,
      '{}',
      p.audit
    FROM public.payouts p
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 6: Create new RPCs for the financial architecture
-- ────────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- RPC: approve_clip — Admin approves a clip, creating a financial record.
-- This is the ONLY way a financial record is created.
-- Atomic: locks campaign, checks budget, creates record, all in one txn.
-- Creates record as 'pending' (awaiting verified metrics for finalization).
-- The earning moves to 'processing' only after verified views > 0 via
-- finalize_clip_earning() (called by ingest_clip_metrics when metrics arrive).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_clip(
  p_clip_id uuid,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip record;
  v_campaign record;
  v_locked_cpm integer;
  v_verified_views integer;
  v_gross integer;
  v_platform_fee integer;
  v_net integer;
  v_max_payout integer;
  v_budget numeric;
  v_reserved numeric;
  v_new_total numeric;
  v_existing record;
  v_record jsonb;
BEGIN
  -- Only admins can approve clips
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve clips';
  END IF;

  -- Get clip
  SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clip not found'; END IF;

  -- Idempotency: if financial record already exists, return it
  SELECT * INTO v_existing FROM public.financial_records WHERE clip_id = p_clip_id;
  IF FOUND THEN
    SELECT to_jsonb(v_existing.*) INTO v_record;
    RETURN v_record;
  END IF;

  -- Get campaign (lock for budget enforcement)
  SELECT * INTO v_campaign
  FROM public.campaigns WHERE id = v_clip.campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  -- FINANCIAL VERSIONING: Use clip's locked terms
  -- Unit convention:
  --   campaigns.payout = rupees
  --   campaigns.max_payout_per_clip = rupees
  --   clips.locked_cpm = paise (already converted by submit_clip)
  --   clips.locked_max_payout = paise (already converted by submit_clip)
  --   financial_records monetary fields = paise
  v_locked_cpm := CASE
    WHEN v_clip.locked_cpm IS NOT NULL THEN v_clip.locked_cpm::integer
    ELSE round(v_campaign.payout * 100)::integer
  END;
  v_verified_views := v_clip.verified_views;

  -- Calculate gross: floor((views * locked_cpm_paise) / 1000)
  v_gross := (v_verified_views * v_locked_cpm) / 1000;

  -- Apply maxPayoutPerClip cap (already in paise from clip, or convert from campaign rupees)
  v_max_payout := CASE
    WHEN v_clip.locked_max_payout IS NOT NULL AND v_clip.locked_max_payout > 0
      THEN v_clip.locked_max_payout::integer
    WHEN v_campaign.max_payout_per_clip IS NOT NULL AND v_campaign.max_payout_per_clip > 0
      THEN round(v_campaign.max_payout_per_clip * 100)::integer
    ELSE NULL
  END;

  IF v_max_payout IS NOT NULL AND v_gross > v_max_payout THEN
    v_gross := v_max_payout;
  END IF;

  -- Platform fee: 10% of gross
  v_platform_fee := round(v_gross * 0.10)::integer;

  -- Net to clipper: gross - platform fee
  v_net := v_gross - v_platform_fee;

  -- BUDGET ENFORCEMENT (atomic)
  -- Reserved = all non-paid records (pending + processing)
  v_budget := v_campaign.budget;
  IF v_budget IS NOT NULL AND v_budget > 0 THEN
    SELECT coalesce(sum(gross_amount), 0) INTO v_reserved
    FROM public.financial_records
    WHERE campaign_id = v_clip.campaign_id
      AND status IN ('pending', 'processing');

    v_new_total := v_reserved + v_gross;
    IF v_new_total > (v_budget * 100) THEN
      RAISE EXCEPTION 'Campaign budget exceeded: reserved ₹% + new ₹% > budget ₹%',
        v_reserved / 100, v_gross / 100, v_budget;
    END IF;
  END IF;

  -- INSERT financial record as 'pending' (awaiting verified metrics)
  -- When verified views > 0 arrive via ingest_clip_metrics(), the earning
  -- will be finalized to 'processing' by finalize_clip_earning().
  INSERT INTO public.financial_records (
    clip_id, campaign_id, clipper_id,
    locked_cpm, locked_max_payout, verified_views,
    gross_amount, platform_fee, net_amount,
    status, audit
  ) VALUES (
    p_clip_id, v_clip.campaign_id, v_clip.user_id,
    v_locked_cpm, v_clip.locked_max_payout, v_verified_views,
    v_gross, v_platform_fee, v_net,
    'pending',
    jsonb_build_object(
      'action', 'created',
      'by', coalesce(p_actor, (SELECT email FROM public.profiles WHERE id = auth.uid())),
      'at', now()
    )
  )
  RETURNING to_jsonb(financial_records.*) INTO v_record;

  -- Update clip status to approved
  UPDATE public.clips SET
    status = 'approved',
    updated_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'approved',
      'by', coalesce(p_actor, (SELECT email FROM public.profiles WHERE id = auth.uid())),
      'at', now()
    )
  WHERE id = p_clip_id;

  RETURN v_record;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_clip(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- process_finance() and pay_finance() REMOVED.
--
-- financial_records.status represents earning finalization, NOT UPI payment.
-- The actual UPI payment happens ONLY through payout_requests.
--
-- Earning lifecycle:  pending → processing (finalized) → paid (claimed by payout)
-- Payment lifecycle:  pending → processing → paid (via payout_requests only)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- RPC: request_payout — Clipper requests a payout of available funds.
-- Creates a payout_requests record with status=pending.
-- Uses advisory lock to prevent concurrent payout requests for same user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_payout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_balance integer;
  v_upi text;
  v_payout_id uuid;
  v_result jsonb;
  v_pending_count integer;
  v_record_ids uuid[];
  v_record_sum integer;
BEGIN
  -- 1. Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Advisory lock: serialize payout requests per user
  -- Prevents two simultaneous requests from both succeeding
  IF NOT pg_try_advisory_xact_lock(
    ('x' || md5(v_user_id::text))::bit(64)::bigint
  ) THEN
    RAISE EXCEPTION 'Another payout request is being processed. Please try again.';
  END IF;

  -- 3. Verify active account
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Account is not active';
  END IF;

  -- 4. Read verified UPI
  SELECT upi INTO v_upi
  FROM public.profiles
  WHERE id = v_user_id AND status = 'active';

  IF v_upi IS NULL OR trim(v_upi) = '' THEN
    RAISE EXCEPTION 'No verified UPI ID on file. Add a UPI ID in Settings first.';
  END IF;

  -- 5. Check no pending/processing payout exists (inside lock)
  SELECT count(*) INTO v_pending_count
  FROM public.payout_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'processing');

  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'A payout request is already in progress. Please wait for it to complete.';
  END IF;

  -- 6. Calculate available balance
  -- Available = sum(processing records) - sum(all active payout requests)
  -- processing = finalized earnings available for withdrawal
  -- paid = already claimed by a completed payout, not available
  SELECT coalesce(sum(net_amount), 0) INTO v_balance
  FROM public.financial_records
  WHERE clipper_id = v_user_id AND status = 'processing';

  v_balance := v_balance - coalesce((
    SELECT coalesce(sum(net_amount), 0)
    FROM public.payout_requests
    WHERE user_id = v_user_id AND status IN ('pending', 'processing', 'paid')
  ), 0);

  -- 7. Enforce minimum ₹100 (10000 paise)
  IF v_balance < 10000 THEN
    RAISE EXCEPTION 'Minimum withdrawal is ₹100. Current available: ₹%', v_balance / 100;
  END IF;

  -- 8. Get the processing finance record IDs that will be covered
  -- Exclude records already referenced by ANY existing payout request
  SELECT array_agg(id), coalesce(sum(net_amount), 0)
  INTO v_record_ids, v_record_sum
  FROM public.financial_records
  WHERE clipper_id = v_user_id AND status = 'processing'
    AND id <> ALL(coalesce(
      (SELECT array_agg(unnest) FROM public.payout_requests,
       unnest(finance_record_ids) WHERE user_id = v_user_id),
      '{}'
    ));

  -- 9. Validate: payout amount must equal sum of referenced records
  IF v_record_sum != v_balance THEN
    RAISE EXCEPTION 'Balance mismatch: calculated ₹% but records total ₹%', v_balance, v_record_sum;
  END IF;

  IF v_record_ids IS NULL OR array_length(v_record_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No eligible financial records for payout';
  END IF;

  -- 10. Create payout request (inside advisory lock)
  INSERT INTO public.payout_requests (
    user_id, amount, net_amount, currency, status, method, upi_id,
    finance_record_ids, audit
  ) VALUES (
    v_user_id, v_balance, v_balance, 'INR', 'pending', 'upi', v_upi,
    v_record_ids,
    jsonb_build_object(
      'action', 'requested',
      'by', (SELECT email FROM public.profiles WHERE id = v_user_id),
      'at', now(),
      'record_count', array_length(v_record_ids, 1)
    )
  )
  RETURNING id INTO v_payout_id;

  -- 11. Mark referenced financial records as 'paid' (claimed by this payout)
  UPDATE public.financial_records SET
    status = 'paid',
    paid_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'claimed_by_payout',
      'payout_id', v_payout_id,
      'at', now()
    )
  WHERE id = ANY(v_record_ids);

  -- Return the payout record
  SELECT to_jsonb(pr.*) INTO v_result
  FROM public.payout_requests pr
  WHERE id = v_payout_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_payout() TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: process_payout_request — Admin marks payout as processing.
-- pending → processing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payout_request(
  p_payout_id uuid,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can process payout requests';
  END IF;

  UPDATE public.payout_requests SET
    status = 'processing',
    processing_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'processing',
      'by', coalesce(p_actor, (SELECT email FROM public.profiles WHERE id = auth.uid())),
      'at', now()
    )
  WHERE id = p_payout_id AND status = 'pending'
  RETURNING to_jsonb(payout_requests.*) INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Payout request not found or not in pending status';
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_payout_request(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: complete_payout_request — Admin confirms UPI payment. processing → paid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_payout_request(
  p_payout_id uuid,
  p_payment_reference text DEFAULT NULL,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout record;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can complete payout requests';
  END IF;

  SELECT * INTO v_payout
  FROM public.payout_requests
  WHERE id = p_payout_id AND status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found or not in processing status';
  END IF;

  -- Mark payout as paid
  UPDATE public.payout_requests SET
    status = 'paid',
    payment_reference = coalesce(p_payment_reference, payment_reference),
    paid_by = auth.uid(),
    paid_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'paid',
      'by', coalesce(p_actor, (SELECT email FROM public.profiles WHERE id = auth.uid())),
      'at', now(),
      'payment_reference', p_payment_reference
    )
  WHERE id = p_payout_id AND status = 'processing'
  RETURNING to_jsonb(payout_requests.*) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_payout_request(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- fail_payout_request REMOVED.
-- The new financial architecture supports only: pending → processing → paid.
-- There is no rejected/failed payout state. If a processing payout cannot be
-- completed, the admin leaves it in 'processing' and surfaces the issue
-- manually. Funds remain reserved until the admin resolves the situation.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- RPC: get_wallet_balance — Derive balance from authoritative financial records.
-- Available = sum(processing records) - sum(all active payout requests)
-- processing = finalized earnings available for withdrawal
-- paid = claimed by a completed payout, not available
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'user_id', p_user_id,
    'available', coalesce((
      SELECT sum(fr.net_amount)
      FROM public.financial_records fr
      WHERE fr.clipper_id = p_user_id AND fr.status = 'processing'
    ), 0)
      - coalesce((
      SELECT sum(pr.net_amount)
      FROM public.payout_requests pr
      WHERE pr.user_id = p_user_id AND pr.status IN ('pending', 'processing', 'paid')
    ), 0),
    'currency', 'INR',
    'total_earned', coalesce((
      SELECT sum(fr.net_amount)
      FROM public.financial_records fr
      WHERE fr.clipper_id = p_user_id
    ), 0),
    'total_paid', coalesce((
      SELECT sum(fr.net_amount)
      FROM public.financial_records fr
      WHERE fr.clipper_id = p_user_id AND fr.status = 'paid'
    ), 0),
    'total_requested', coalesce((
      SELECT sum(pr.net_amount)
      FROM public.payout_requests pr
      WHERE pr.user_id = p_user_id AND pr.status IN ('pending', 'processing', 'paid')
    ), 0)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_balance(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_clipper_finance_records — Get financial records for a clipper.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_clipper_finance_records(
  p_clipper_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(fr.*), '[]'::jsonb)
  FROM (
    SELECT * FROM public.financial_records
    WHERE clipper_id = p_clipper_id
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) fr;
$$;

GRANT EXECUTE ON FUNCTION public.get_clipper_finance_records(uuid, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_payout_requests — Get payout history for a user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_payout_requests(
  p_user_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(pr.*), '[]'::jsonb)
  FROM (
    SELECT * FROM public.payout_requests
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) pr;
$$;

GRANT EXECUTE ON FUNCTION public.get_payout_requests(uuid, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_all_payout_requests — Admin view of all payout requests.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_all_payout_requests(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(pr.*), '[]'::jsonb)
  FROM (
    SELECT * FROM public.payout_requests
    WHERE (p_status IS NULL OR status = p_status)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) pr;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_payout_requests(text, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_campaign_budget — Authoritative budget calculation.
-- Both creator and admin dashboards MUST use this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_campaign_budget(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'campaign_id', p_campaign_id,
    'total', coalesce(c.budget, 0),
    'spent', coalesce((
      SELECT sum(fr.gross_amount)
      FROM public.financial_records fr
      WHERE fr.campaign_id = p_campaign_id AND fr.status = 'paid'
    ), 0),
    'committed', coalesce((
      SELECT sum(fr.gross_amount)
      FROM public.financial_records fr
      WHERE fr.campaign_id = p_campaign_id AND fr.status IN ('pending', 'processing')
    ), 0),
    'remaining', greatest(0,
      coalesce(c.budget, 0) * 100
      - coalesce((
        SELECT sum(fr.gross_amount)
        FROM public.financial_records fr
        WHERE fr.campaign_id = p_campaign_id AND fr.status IN ('paid', 'pending', 'processing')
      ), 0)
    )
  )
  FROM public.campaigns c
  WHERE c.id = p_campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_budget(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 7: Update clip status CHECK constraint (moderation only)
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_status_check;
  ALTER TABLE public.clips ADD CONSTRAINT clips_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'held'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 8: Remove old financial RPCs (replaced by new ones above)
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN DROP FUNCTION IF EXISTS public.process_finance(uuid, text, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.pay_finance(uuid, text, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.create_earning(uuid, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.update_earning_status(uuid, text, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.process_payout(uuid, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.complete_payout(uuid, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.fail_payout(uuid, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.reverse_payout(uuid, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.reverse_ledger_entry(uuid, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.adjust_wallet(uuid, integer, text); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.get_wallet_entries(uuid, integer, integer); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.get_clipper_earnings(uuid); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.get_user_payouts(uuid, integer, integer); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.test_max_payout_enforcement(); END $$;
DO $$ BEGIN DROP FUNCTION IF EXISTS public.fail_payout_request(uuid, text); END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 9: Update wallet_ledger types (remove old financial types)
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_type_check;
  ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_type_check
    CHECK (type IN ('earning_credit', 'adjustment', 'payout_debit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 10: Update clip updated_at column (ensure it exists)
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS updated_at timestamptz;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────────────────────
