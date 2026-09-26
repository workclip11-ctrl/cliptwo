-- ==========================================================================
-- Social RLS hardening + security-definer trigger enforcement
--
-- FINDING (production-readiness audit, Item 4):
--   The canonical schema files grant browser-reachable write policies on the
--   three social tables that must be server-only:
--     social_accounts      INSERT policy (browser could attach a social
--                          account without completing OAuth, then have it
--                          read by the sync/cron metrics path as "connected")
--     social_connections   INSERT + UPDATE policies (browser could write or
--                          alter OAuth token columns directly)
--     social_oauth_states  INSERT + DELETE policies (browser could forge or
--                          clear CSRF/PKCE state)
--   Two SECURITY DEFINER triggers that back these guarantees exist only in
--   loose manual files (admin-schema.sql, security-hardening-migration.sql),
--   so an environment built from schema.sql + numbered migrations may lack
--   them entirely.
--
-- WHAT THIS MIGRATION DOES (complete scope; nothing else is touched):
--   1. social_accounts      — DROP the INSERT policy (idempotent)
--   2. social_connections   — DROP the INSERT and UPDATE policies (idempotent)
--   3. social_oauth_states  — ENABLE row level security and DROP the INSERT
--                             and DELETE policies (idempotent)
--   4. CREATE OR REPLACE     public.enforce_social_account_field_permissions()
--      + (DROP IF EXISTS / CREATE) trigger enforce_social_account_fields
--      on social_accounts (BEFORE UPDATE)
--   5. CREATE OR REPLACE     public.enforce_social_connection_token_protection()
--      + (DROP IF EXISTS / CREATE) trigger enforce_social_connection_tokens
--      on social_connections (BEFORE UPDATE)
--
-- PRESERVED (explicitly NOT dropped or redefined; reported by the
-- verification block at the end of this file):
--   social_accounts          SELECT/UPDATE/DELETE own-row policies
--   social_connections       social_connections_no_browser_select
--                            (SELECT USING (false)) and own-row DELETE
--   social_oauth_states      no policies at all (backend-only table)
--
-- WHY THIS IS SAFE ON THE EXISTING PRODUCTION DATABASE:
--   - Every production write to these three tables already goes through
--     createServiceClient() (service_role), which bypasses RLS and, because
--     auth.uid() is NULL for a service_role JWT, bypasses both trigger
--     guards. Browser code only ever SELECTs social_accounts.
--   - All statements are idempotent: DROP POLICY IF EXISTS, CREATE OR
--     REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER (no
--     duplicate triggers on re-run), ALTER TABLE ... ENABLE ROW LEVEL
--     SECURITY (no-op when already enabled).
--   - The whole script is a single implicit transaction in the SQL Editor:
--     any error rolls everything back (no partial application).
--   - No data is inserted, updated, or deleted; no seed rows, no app_settings
--     changes, no cron_secret, no OAuth credentials, no role grants, no
--     unrelated tables.
--
-- DEPENDENCIES (must already exist; NOT created here):
--   public.is_admin()   — admin-schema.sql
--   auth.uid()          — Supabase auth schema
--   public.social_accounts, public.social_connections,
--   public.social_oauth_states — schema.sql / admin-schema.sql
--
-- RUN AFTER: migrations/20250101000010_harden_ingest_clip_metrics.sql, and
-- after admin-schema.sql + security-hardening-migration.sql on an existing
-- environment (their definitions are re-asserted idempotently below).
--
-- NOT EXECUTED AGAINST SUPABASE — apply manually via the SQL Editor, then run
-- supabase/campaign-payment-hardening-tests.sql (TEST 4.1, 4.2),
-- supabase/rls-tests.sql and supabase/social-and-metrics-integration-tests.sql.
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- 0. Preflight: fail fast with a clear message if the social tables are
--    missing (nothing below could apply meaningfully). Exception aborts the
--    script, which the SQL Editor rolls back as one transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(name, ', ' order by name)
  into v_missing
  from unnest(array[
    'social_accounts',
    'social_connections',
    'social_oauth_states'
  ]) as t(name)
  where to_regclass('public.' || name) is null;

  if v_missing is not null then
    raise exception 'social_rls_hardening: missing table(s): % — run supabase/schema.sql before this migration', v_missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. RLS stays enabled on all three social tables (idempotent re-assert).
-- ---------------------------------------------------------------------------
alter table public.social_accounts enable row level security;
alter table public.social_connections enable row level security;
alter table public.social_oauth_states enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Drop the browser-reachable write policies.
--    Rows are created and token columns are written exclusively by the
--    server-side OAuth callback / sync backend through service_role.
-- ---------------------------------------------------------------------------
drop policy if exists "social_accounts_insert" on public.social_accounts;

drop policy if exists "social_connections_insert" on public.social_connections;
drop policy if exists "social_connections_update" on public.social_connections;

drop policy if exists "social_oauth_states_insert" on public.social_oauth_states;
drop policy if exists "social_oauth_states_delete" on public.social_oauth_states;

-- ---------------------------------------------------------------------------
-- 3. Second layer: enforce_social_account_fields (BEFORE UPDATE on
--    social_accounts). Service-role (auth.uid() IS NULL) and admins pass;
--    non-admins cannot change verified / provider_account_id / status.
--    CREATE OR REPLACE does not reset existing ACLs, and DROP TRIGGER IF
--    EXISTS before CREATE TRIGGER prevents duplicates on re-run.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_social_account_field_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role (auth.uid() is NULL) — trusted server operations, skip checks.
  -- The OAuth callback, disconnect, and verify routes use service-role for
  -- trusted writes. These are server-side only and never reachable from the browser.
  if auth.uid() is null then
    return NEW;
  end if;

  -- Admins can change anything (skip checks)
  if public.is_admin() then
    return NEW;
  end if;

  -- Non-admins: block changes to trust fields
  if (OLD.verified IS DISTINCT FROM NEW.verified) then
    raise exception 'Only admins can change verified status';
  end if;
  if (OLD.provider_account_id IS DISTINCT FROM NEW.provider_account_id) then
    raise exception 'Only admins can change provider_account_id';
  end if;
  if (OLD.status IS DISTINCT FROM NEW.status) then
    raise exception 'Only admins can change connection status';
  end if;

  return NEW;
end;
$$;

drop trigger if exists enforce_social_account_fields on public.social_accounts;
create trigger enforce_social_account_fields
  before update on public.social_accounts
  for each row
  execute function public.enforce_social_account_field_permissions();

-- ---------------------------------------------------------------------------
-- 4. Second layer: enforce_social_connection_tokens (BEFORE UPDATE on
--    social_connections). Even if an UPDATE policy were ever re-created,
--    non-admins cannot modify backend-managed OAuth token fields.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_social_connection_token_protection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role (auth.uid() is NULL) — trusted server operations, skip checks.
  -- The OAuth callback, disconnect, and metrics routes use service-role for
  -- trusted writes. These are server-side only and never reachable from the browser.
  if auth.uid() is null then
    return NEW;
  end if;

  -- Admins can change anything (skip checks)
  if public.is_admin() then
    return NEW;
  end if;

  -- Non-admins: block changes to backend-managed token fields.
  -- These columns are written exclusively by the backend via service_role.
  if (OLD.access_token_enc IS DISTINCT FROM NEW.access_token_enc) then
    raise exception 'Cannot modify access_token_enc directly';
  end if;
  if (OLD.refresh_token_enc IS DISTINCT FROM NEW.refresh_token_enc) then
    raise exception 'Cannot modify refresh_token_enc directly';
  end if;
  if (OLD.expires_at IS DISTINCT FROM NEW.expires_at) then
    raise exception 'Cannot modify expires_at directly';
  end if;
  if (OLD.scope IS DISTINCT FROM NEW.scope) then
    raise exception 'Cannot modify scope directly';
  end if;
  if (OLD.provider_meta IS DISTINCT FROM NEW.provider_meta) then
    raise exception 'Cannot modify provider_meta directly';
  end if;

  return NEW;
end;
$$;

drop trigger if exists enforce_social_connection_tokens on public.social_connections;
create trigger enforce_social_connection_tokens
  before update on public.social_connections
  for each row
  execute function public.enforce_social_connection_token_protection();

-- ---------------------------------------------------------------------------
-- 5. Verification (informational only — no exceptions, so it can never fail
--    an otherwise successful application). Expected output after this
--    migration:
--      social policies      : social_accounts.{select,update,delete},
--                             social_connections.{no_browser_select,delete}
--                             (nothing on social_oauth_states)
--      social triggers      : enforce_social_account_fields,
--                             enforce_social_connection_tokens
--      is_admin dependency  : present
-- ---------------------------------------------------------------------------
do $$
declare
  v_policies text;
  v_triggers text;
  v_is_admin boolean;
begin
  select string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname)
  into v_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('social_accounts', 'social_connections', 'social_oauth_states');

  select string_agg(c.relname || '.' || t.tgname, ', ' order by c.relname, t.tgname)
  into v_triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and t.tgname in ('enforce_social_account_fields', 'enforce_social_connection_tokens');

  v_is_admin := to_regprocedure('public.is_admin()') is not null;

  raise notice 'social_rls_hardening: policies = %', coalesce(v_policies, '(none)');
  raise notice 'social_rls_hardening: triggers = %', coalesce(v_triggers, '(none)');
  raise notice 'social_rls_hardening: is_admin() dependency present = %', v_is_admin;
end $$;
