-- ===========================================================================
-- INTEGRITY CONSTRAINTS MIGRATION
-- Run this ONCE on existing databases to add all domain constraints.
-- Safe to re-run: every statement uses IF NOT EXISTS / exception handling.
--
-- Strategy:
--   1. Backfill required ownership fields from existing data where possible
--   2. Add CHECK/UNIQUE constraints with NOT VALID (skips existing row scan)
--   3. VALIDATE CONSTRAINT in a separate step (scans rows, non-blocking)
--
-- The VALIDATE step will FAIL if existing rows violate the constraint.
-- If it fails, fix the offending rows first, then re-run this file.
-- ===========================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: BACKFILL REQUIRED OWNERSHIP FIELDS
-- campaigns.created_by and clips.user_id must NOT NULL in new schema.
-- For existing rows where these are NULL, we cannot auto-fix (no owner info).
-- Strategy: create a system-level placeholder so NOT NULL constraint holds.
-- ────────────────────────────────────────────────────────────────────────────

-- Backfill campaigns.created_by where NULL
DO $$ BEGIN
  UPDATE public.campaigns SET created_by = '00000000-0000-0000-0000-000000000099'
  WHERE created_by IS NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;;

-- Backfill clips.user_id where NULL
DO $$ BEGIN
  UPDATE public.clips SET user_id = '00000000-0000-0000-0000-000000000099'
  WHERE user_id IS NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;;

-- ────────────────────────────────────────────────────────────────────────────
-- HELPER: check if a column exists on a table
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _col_exists(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: ADD CONSTRAINTS (NOT VALID for speed, then VALIDATE)
-- NOT VALID = only checks new rows, skips existing row scan.
-- VALIDATE CONSTRAINT = scans existing rows in a separate (non-blocking) step.
-- ────────────────────────────────────────────────────────────────────────────

-- ── profiles ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('clipper', 'creator', 'admin')) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_role_check;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE profiles_role_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('active', 'suspended', 'deactivated')) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_status_check;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE profiles_status_check failed — fix offending rows and re-run';
END $$;;

-- ── campaigns ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check
    CHECK (status IN ('open', 'closed', 'draft', 'paused', 'archived', 'budget_reached', 'near_budget')) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns VALIDATE CONSTRAINT campaigns_status_check;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE campaigns_status_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_payout_nonneg
    CHECK (payout >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns VALIDATE CONSTRAINT campaigns_payout_nonneg;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE campaigns_payout_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_budget_nonneg
    CHECK (budget >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns VALIDATE CONSTRAINT campaigns_budget_nonneg;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE campaigns_budget_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_spent_nonneg
    CHECK (spent >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns VALIDATE CONSTRAINT campaigns_spent_nonneg;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE campaigns_spent_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_days_left_nonneg
    CHECK (days_left >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns VALIDATE CONSTRAINT campaigns_days_left_nonneg;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE campaigns_days_left_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_max_payout_nonneg
    CHECK (max_payout_per_clip IS NULL OR max_payout_per_clip >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns VALIDATE CONSTRAINT campaigns_max_payout_nonneg;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE campaigns_max_payout_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_spend_cap_nonneg
    CHECK (spend_cap IS NULL OR spend_cap >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns VALIDATE CONSTRAINT campaigns_spend_cap_nonneg;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE campaigns_spend_cap_nonneg failed — fix offending rows and re-run';
END $$;;

-- campaigns.created_by NOT NULL
DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_created_by_not_null
    CHECK (created_by IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns VALIDATE CONSTRAINT campaigns_created_by_not_null;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE campaigns_created_by_not_null failed — backfill created_by on campaigns first';
END $$;;

-- ── clips ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.clips ADD CONSTRAINT clips_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'held')) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.clips VALIDATE CONSTRAINT clips_status_check;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clips_status_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  ALTER TABLE public.clips ADD CONSTRAINT clips_views_nonneg
    CHECK (views >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.clips VALIDATE CONSTRAINT clips_views_nonneg;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clips_views_nonneg failed — fix offending rows and re-run';
END $$;;

-- clips.verified_views (only if column exists)
DO $$ BEGIN
  IF _col_exists('clips', 'verified_views') THEN
    ALTER TABLE public.clips ADD CONSTRAINT clips_verified_views_nonneg
      CHECK (verified_views >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF _col_exists('clips', 'verified_views') THEN
    ALTER TABLE public.clips VALIDATE CONSTRAINT clips_verified_views_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clips_verified_views_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF _col_exists('clips', 'locked_cpm') THEN
    ALTER TABLE public.clips ADD CONSTRAINT clips_locked_cpm_nonneg
      CHECK (locked_cpm IS NULL OR locked_cpm >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF _col_exists('clips', 'locked_cpm') THEN
    ALTER TABLE public.clips VALIDATE CONSTRAINT clips_locked_cpm_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clips_locked_cpm_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF _col_exists('clips', 'locked_max_payout') THEN
    ALTER TABLE public.clips ADD CONSTRAINT clips_locked_max_payout_nonneg
      CHECK (locked_max_payout IS NULL OR locked_max_payout >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF _col_exists('clips', 'locked_max_payout') THEN
    ALTER TABLE public.clips VALIDATE CONSTRAINT clips_locked_max_payout_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clips_locked_max_payout_nonneg failed — fix offending rows and re-run';
END $$;;

-- clips.user_id NOT NULL
DO $$ BEGIN
  ALTER TABLE public.clips ADD CONSTRAINT clips_user_id_not_null
    CHECK (user_id IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.clips VALIDATE CONSTRAINT clips_user_id_not_null;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clips_user_id_not_null failed — backfill user_id on clips first';
END $$;;

-- clips.txn_id unique (only if column exists)
DO $$ BEGIN
  IF _col_exists('clips', 'txn_id') THEN
    ALTER TABLE public.clips ADD CONSTRAINT clips_txn_id_unique
      UNIQUE (txn_id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF _col_exists('clips', 'txn_id') THEN
    ALTER TABLE public.clips VALIDATE CONSTRAINT clips_txn_id_unique;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clips_txn_id_unique failed — deduplicate txn_id values first';
END $$;;

-- ── clip_metrics (only if table exists) ─────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics ADD CONSTRAINT clip_metrics_source_check
      CHECK (source IN ('platform_api', 'manual', 'mock', 'admin_override')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics VALIDATE CONSTRAINT clip_metrics_source_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clip_metrics_source_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics ADD CONSTRAINT clip_metrics_verification_check
      CHECK (verification_status IN ('pending', 'verified', 'failed', 'disputed')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics VALIDATE CONSTRAINT clip_metrics_verification_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clip_metrics_verification_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics ADD CONSTRAINT clip_metrics_views_nonneg
      CHECK (views >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics VALIDATE CONSTRAINT clip_metrics_views_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clip_metrics_views_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics ADD CONSTRAINT clip_metrics_likes_nonneg
      CHECK (likes >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics VALIDATE CONSTRAINT clip_metrics_likes_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clip_metrics_likes_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics ADD CONSTRAINT clip_metrics_comments_nonneg
      CHECK (comments >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics VALIDATE CONSTRAINT clip_metrics_comments_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clip_metrics_comments_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics ADD CONSTRAINT clip_metrics_shares_nonneg
      CHECK (shares >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics VALIDATE CONSTRAINT clip_metrics_shares_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clip_metrics_shares_nonneg failed — fix offending rows and re-run';
END $$;;

-- ── metrics_sync_jobs (only if table exists) ────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='metrics_sync_jobs') THEN
    ALTER TABLE public.metrics_sync_jobs ADD CONSTRAINT metrics_sync_jobs_status_check
      CHECK (status IN ('pending', 'running', 'completed', 'failed')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='metrics_sync_jobs') THEN
    ALTER TABLE public.metrics_sync_jobs VALIDATE CONSTRAINT metrics_sync_jobs_status_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE metrics_sync_jobs_status_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='metrics_sync_jobs') THEN
    ALTER TABLE public.metrics_sync_jobs ADD CONSTRAINT metrics_sync_jobs_captured_nonneg
      CHECK (metrics_captured >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='metrics_sync_jobs') THEN
    ALTER TABLE public.metrics_sync_jobs VALIDATE CONSTRAINT metrics_sync_jobs_captured_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE metrics_sync_jobs_captured_nonneg failed — fix offending rows and re-run';
END $$;;

-- ── social_accounts ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_accounts') THEN
    ALTER TABLE public.social_accounts ADD CONSTRAINT social_accounts_status_check
      CHECK (status IN ('not_connected', 'connecting', 'connected', 'verified', 'connection_error', 'disconnected', 'verification_failed')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_accounts') THEN
    ALTER TABLE public.social_accounts VALIDATE CONSTRAINT social_accounts_status_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE social_accounts_status_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_accounts') THEN
    ALTER TABLE public.social_accounts ADD CONSTRAINT social_accounts_user_platform_unique
      UNIQUE (user_id, platform);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_accounts') THEN
    ALTER TABLE public.social_accounts VALIDATE CONSTRAINT social_accounts_user_platform_unique;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE social_accounts_user_platform_unique failed — deduplicate social accounts first';
END $$;;

-- ── social_connections ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_connections') THEN
    ALTER TABLE public.social_connections ADD CONSTRAINT social_connections_account_unique
      UNIQUE (social_account_id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_connections') THEN
    ALTER TABLE public.social_connections VALIDATE CONSTRAINT social_connections_account_unique;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE social_connections_account_unique failed — deduplicate connections first';
END $$;;

-- ── earnings (only if table exists) ─────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings ADD CONSTRAINT earnings_status_check
      CHECK (status IN ('pending', 'approved', 'paid', 'failed')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings VALIDATE CONSTRAINT earnings_status_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE earnings_status_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings ADD CONSTRAINT earnings_locked_cpm_nonneg
      CHECK (locked_cpm >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings VALIDATE CONSTRAINT earnings_locked_cpm_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE earnings_locked_cpm_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings ADD CONSTRAINT earnings_verified_views_nonneg
      CHECK (verified_views >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings VALIDATE CONSTRAINT earnings_verified_views_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE earnings_verified_views_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings ADD CONSTRAINT earnings_gross_nonneg
      CHECK (gross_amount >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings VALIDATE CONSTRAINT earnings_gross_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE earnings_gross_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings ADD CONSTRAINT earnings_platform_fee_nonneg
      CHECK (platform_fee >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings VALIDATE CONSTRAINT earnings_platform_fee_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE earnings_platform_fee_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings ADD CONSTRAINT earnings_net_nonneg
      CHECK (net_amount >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings VALIDATE CONSTRAINT earnings_net_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE earnings_net_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings ADD CONSTRAINT earnings_creator_fee_nonneg
      CHECK (creator_fee >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings VALIDATE CONSTRAINT earnings_creator_fee_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE earnings_creator_fee_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings ADD CONSTRAINT earnings_clip_unique
      UNIQUE (clip_id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='earnings') THEN
    ALTER TABLE public.earnings VALIDATE CONSTRAINT earnings_clip_unique;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE earnings_clip_unique failed — deduplicate earnings first';
END $$;;

-- ── payouts (only if table exists) ──────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payouts') THEN
    ALTER TABLE public.payouts ADD CONSTRAINT payouts_amount_nonneg
      CHECK (amount >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payouts') THEN
    ALTER TABLE public.payouts VALIDATE CONSTRAINT payouts_amount_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE payouts_amount_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payouts') THEN
    ALTER TABLE public.payouts ADD CONSTRAINT payouts_net_amount_nonneg
      CHECK (net_amount >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payouts') THEN
    ALTER TABLE public.payouts VALIDATE CONSTRAINT payouts_net_amount_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE payouts_net_amount_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payouts') THEN
    ALTER TABLE public.payouts ADD CONSTRAINT payouts_retry_count_nonneg
      CHECK (retry_count >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payouts') THEN
    ALTER TABLE public.payouts VALIDATE CONSTRAINT payouts_retry_count_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE payouts_retry_count failed — fix offending rows and re-run';
END $$;;

-- ── financial_records ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_records') THEN
    ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_status_check
      CHECK (status IN ('pending', 'processing', 'paid')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_records') THEN
    ALTER TABLE public.financial_records VALIDATE CONSTRAINT financial_records_status_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE financial_records_status_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_records') THEN
    ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_gross_nonneg
      CHECK (gross_amount >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_records') THEN
    ALTER TABLE public.financial_records VALIDATE CONSTRAINT financial_records_gross_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE financial_records_gross_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_records') THEN
    ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_fee_nonneg
      CHECK (platform_fee >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_records') THEN
    ALTER TABLE public.financial_records VALIDATE CONSTRAINT financial_records_fee_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE financial_records_fee_nonneg failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_records') THEN
    ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_net_nonneg
      CHECK (net_amount >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_records') THEN
    ALTER TABLE public.financial_records VALIDATE CONSTRAINT financial_records_net_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE financial_records_net_nonneg failed — fix offending rows and re-run';
END $$;;

-- Unique: one financial record per clip
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_records') THEN
    ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_clip_unique
      UNIQUE (clip_id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── payout_requests ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payout_requests') THEN
    ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_status_check
      CHECK (status IN ('pending', 'processing', 'paid', 'rejected')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payout_requests') THEN
    ALTER TABLE public.payout_requests VALIDATE CONSTRAINT payout_requests_status_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE payout_requests_status_check failed — fix offending rows and re-run';
END $$;;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payout_requests') THEN
    ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_amount_nonneg
      CHECK (amount >= 0 AND net_amount >= 0) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payout_requests') THEN
    ALTER TABLE public.payout_requests VALIDATE CONSTRAINT payout_requests_amount_nonneg;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE payout_requests_amount_nonneg failed — fix offending rows and re-run';
END $$;;

-- ── wallet_ledger ──────────────────────────────────────────────────────────
-- NOTE: wallet_ledger amounts CAN be negative (debit entries store negative
-- values). The previous wallet_ledger_amount_nonneg constraint was incorrect
-- and has been removed. The wallet_ledger_type_check (in financial-rewrite.sql)
-- constrains valid entry types instead.
DO $$ BEGIN
  ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_amount_nonneg;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Platform constraints (YouTube, Instagram, Kick only) ─────────────────────

-- campaigns.platform: valid platform values
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaigns') THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_platform_check
      CHECK (platform IN ('YouTube', 'Instagram', 'Kick')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaigns') THEN
    ALTER TABLE public.campaigns VALIDATE CONSTRAINT campaigns_platform_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE campaigns_platform_check failed — fix offending rows and re-run';
END $$;;

-- clips.platform: valid platform values
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clips') THEN
    ALTER TABLE public.clips ADD CONSTRAINT clips_platform_check
      CHECK (platform IN ('YouTube', 'Instagram', 'Kick')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clips') THEN
    ALTER TABLE public.clips VALIDATE CONSTRAINT clips_platform_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clips_platform_check failed — fix offending rows and re-run';
END $$;;

-- social_accounts.platform: valid platform values
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_accounts') THEN
    ALTER TABLE public.social_accounts ADD CONSTRAINT social_accounts_platform_check
      CHECK (platform IN ('YouTube', 'Instagram', 'Kick')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_accounts') THEN
    ALTER TABLE public.social_accounts VALIDATE CONSTRAINT social_accounts_platform_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE social_accounts_platform_check failed — fix offending rows and re-run';
END $$;;

-- social_connections.platform: valid platform values
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_connections') THEN
    ALTER TABLE public.social_connections ADD CONSTRAINT social_connections_platform_check
      CHECK (platform IN ('YouTube', 'Instagram', 'Kick')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_connections') THEN
    ALTER TABLE public.social_connections VALIDATE CONSTRAINT social_connections_platform_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE social_connections_platform_check failed — fix offending rows and re-run';
END $$;;

-- clip_metrics.platform: valid platform values
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics ADD CONSTRAINT clip_metrics_platform_check
      CHECK (platform IN ('YouTube', 'Instagram', 'Kick')) NOT VALID;
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clip_metrics') THEN
    ALTER TABLE public.clip_metrics VALIDATE CONSTRAINT clip_metrics_platform_check;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'VALIDATE clip_metrics_platform_check failed — fix offending rows and re-run';
END $$;;

-- ────────────────────────────────────────────────────────────────────────────
-- CLEANUP: drop helper function
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS _col_exists(text, text);

-- ────────────────────────────────────────────────────────────────────────────
-- DONE
-- Re-run this file until all VALIDATE steps pass without warnings.
-- Each WARNING means there are existing rows that violate the constraint.
-- Fix those rows, then re-run.
-- ────────────────────────────────────────────────────────────────────────────
