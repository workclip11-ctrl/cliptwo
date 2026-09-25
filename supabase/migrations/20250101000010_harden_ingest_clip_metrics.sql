-- ==========================================================================
-- ingest_clip_metrics authorization hardening
--
-- FINDING (production-readiness audit):
--   public.ingest_clip_metrics(...) is SECURITY DEFINER and historically
--   only ever GRANT'd to service_role — but PostgreSQL gives every new
--   function EXECUTE to PUBLIC by default, and the REVOKEs that close that
--   hole exist ONLY in loose manual files (supabase/phase7a-lock-service-rpcs.sql,
--   supabase/security-hardening-migration.sql PART 15). No numbered migration
--   in supabase/migrations/ enforces the ACL, so any environment built from
--   schema.sql + numbered migrations leaves the function callable by
--   anon/authenticated — i.e. any Creator/Clipper could call
--   supabase.rpc('ingest_clip_metrics') with
--   source='mock', verification_status='verified', inflating
--   clips.verified_views and triggering finalize_clip_earning() → earnings.
--
-- FIX (two independent layers):
--   1. Privilege layer — numbered migration REVOKEs EXECUTE from
--      PUBLIC/anon/authenticated and GRANTs only service_role (idempotent;
--      CREATE OR REPLACE does not reset ACLs on an existing function).
--   2. Internal authorization layer — the function body itself now decides
--      who may ingest, reading ONLY the authoritative JWT claims GUC (never
--      any client-supplied role/user id). This holds even if the EXECUTE
--      grants are ever accidentally re-opened by a future migration.
--
-- AUTHORIZATION MATRIX (enforced inside the function body):
--   session kind                                   sources allowed
--   ---------------------------------------------- --------------------------
--   direct DB session (SQL editor / psql / pg_cron; platform_api, manual,
--     empty request.jwt.claims) = admin tool        mock, admin_override
--   PostgREST JWT role = service_role               platform_api ONLY
--     (trusted backend: sync/cron/admin-trigger routes)
--   any other JWT (anon, authenticated incl.        NONE — denied
--     Creator/Clipper/Admin UI sessions)
--   malformed claims JSON                           NONE — denied (fail-closed)
--
-- NOT changed here (preserved intentionally):
--   - clip_metrics immutability (no UPDATE/DELETE), clips.verified_views
--     monotonic regression guard, auto-finalize of approved clips
--   - fail-closed metric verification (failed Insights never ingested)
--   - RLS: clip_metrics_insert_service still requires public.is_admin()
--   - admin investigations/backfills keep mock/manual/admin_override via a
--     direct DB session (they remain unreachable through any API workflow)
--   - sync/cron/admin-trigger route behavior (all pass platform_api,
--     verified metrics, ownership-verified accounts, via service_role)
--
-- NOT EXECUTED AGAINST SUPABASE — apply manually via the SQL Editor AFTER
-- migrations/20250101000009_production_cron_base_url.sql (and after the
-- admin-schema.sql / security-hardening-migration.sql definitions on an
-- existing environment). Then run
-- supabase/ingest-clip-metrics-security-tests.sql (tests A–L).
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- 1. CREATE OR REPLACE with the internal authorization + source tiers.
--    Validations now run BEFORE the clip lookup so authorization and source
--    errors surface ahead of data errors (error precedence only; the
--    happy-path behavior is unchanged).
-- ---------------------------------------------------------------------------

create or replace function public.ingest_clip_metrics(
  p_clip_id uuid,
  p_views integer,
  p_likes integer default 0,
  p_comments integer default 0,
  p_shares integer default 0,
  p_source text default 'platform_api',
  p_verification_status text default 'verified'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text;
  v_jwt_role text;
  v_is_service boolean := false;
  v_clip record;
  v_metric_id uuid;
  v_metric jsonb;
  v_finalized jsonb;
begin
  -- ── INTERNAL AUTHORIZATION (defense-in-depth) ─────────────────────────────
  -- request.jwt.claims is set by PostgREST from the verified JWT (or by an
  -- explicit SET LOCAL in tests). It is never client-forgeable inside the
  -- database, unlike any p_* parameter.
  v_claims := nullif(current_setting('request.jwt.claims', true), '');

  -- v_claims IS NULL ⇒ direct database session (SQL editor / psql / pg_cron
  -- as owner): admin investigation and backfill path — allowed below.
  if v_claims is not null then
    begin
      v_jwt_role := coalesce(v_claims::jsonb ->> 'role', '');
    exception when others then
      raise exception 'ingest_clip_metrics: malformed JWT claims (denied)';
    end;

    if v_jwt_role = 'service_role' then
      v_is_service := true;
    else
      -- Any other JWT (anon / authenticated incl. Creator, Clipper, Admin UI)
      raise exception
        'ingest_clip_metrics: denied for JWT role "%". Only the trusted backend (service_role) or a direct admin session may ingest metrics.',
        v_jwt_role;
    end if;
  end if;

  -- ── SOURCE TIERS ──────────────────────────────────────────────────────────
  -- Production application paths (service_role) may only ever claim
  -- platform_api. mock/manual/admin_override are retained for manual
  -- investigations and backfills through a direct DB session only.
  if v_is_service then
    if p_source <> 'platform_api' then
      raise exception
        'ingest_clip_metrics: backend path allows source "platform_api" only (got "%")',
        p_source;
    end if;
  elsif p_source not in ('platform_api', 'manual', 'mock', 'admin_override') then
    raise exception 'Invalid source: %', p_source;
  end if;

  -- Validate verification_status
  if p_verification_status not in ('pending', 'verified', 'failed', 'disputed') then
    raise exception 'Invalid verification_status: %', p_verification_status;
  end if;

  -- Validate views are non-negative
  if p_views < 0 then
    raise exception 'Views cannot be negative: %', p_views;
  end if;

  -- Get clip (after input validation so authorization/source errors surface first)
  select * into v_clip from public.clips where id = p_clip_id;
  if not found then
    raise exception 'Clip not found: %', p_clip_id;
  end if;

  -- Insert immutable metric snapshot (historical record, never modified)
  insert into public.clip_metrics (
    clip_id, campaign_id, platform, views, likes, comments, shares,
    source, verification_status, captured_at
  ) values (
    p_clip_id, v_clip.campaign_id, v_clip.platform,
    p_views, p_likes, p_comments, p_shares,
    p_source, p_verification_status, now()
  )
  returning id into v_metric_id;

  -- Only update verified_views if the metric is verified
  if p_verification_status = 'verified' then
    -- VERIFIED VIEWS REGRESSION GUARD: only update if NULL or new value is higher.
    -- This prevents a lower API response from reducing an already-recorded count.
    update public.clips set
      verified_views = case
        when v_clip.verified_views is null then p_views
        when p_views > v_clip.verified_views then p_views
        else v_clip.verified_views
      end,
      updated_at = now()
    where id = p_clip_id;

    -- AUTO-FINALIZE: If clip is approved and has a pending financial record,
    -- move the earning from pending → processing now that verified views > 0.
    -- If verified_views is still 0, the record remains pending.
    if p_views > 0 and v_clip.status = 'approved' then
      v_finalized := public.finalize_clip_earning(p_clip_id);
      -- v_finalized is null if no pending record or no views; that's fine.
    end if;
  end if;

  -- Return the created metric
  select to_jsonb(cm.*) into v_metric
  from public.clip_metrics cm
  where id = v_metric_id;

  return v_metric;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Privilege layer: service_role only (idempotent — REVOKE of a missing
--    privilege is a no-op; GRANT re-assert is a no-op).
--    Order matters for a fresh database: CREATE OR REPLACE above guarantees
--    the function exists so the REVOKEs below always succeed in the same
--    transaction, before anything can execute it.
-- ---------------------------------------------------------------------------

revoke execute on function public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) from public;
revoke execute on function public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) from anon;
revoke execute on function public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) from authenticated;
grant execute on function public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Post-verification (run manually; prints booleans only, no secrets):
--
-- select
--   has_function_privilege('anon',
--     'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)',
--     'execute')                          as anon_can_call,          -- false
--   has_function_privilege('authenticated',
--     'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)',
--     'execute')                          as authenticated_can_call, -- false
--   has_function_privilege('service_role',
--     'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)',
--     'execute')                          as service_can_call,       -- true
--   exists (
--     select 1 from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname = 'ingest_clip_metrics'
--       and p.prosrc like '%request.jwt.claims%'
--   )                                     as internal_guard_present; -- true
-- ---------------------------------------------------------------------------
