-- ==========================================================================
-- update_campaign — allow non-financial campaign detail edits after publish
--
-- FINDING (backend authorization/update-policy fix):
--   The edit modal (EditCampaignModal -> store.updateCampaign -> RPC
--   update_campaign) always sends the whole form, including the financial
--   echo values (payout, maxPayoutPerClip, budget, ...). update_campaign
--   treated "the patch CONTAINS a financial key" as "the creator is trying
--   to change financial terms", so as soon as a campaign had any submission
--   the WHOLE update was rejected — title, brief, category, platforms, dates
--   and every creative detail field failed with the same error as a CPM
--   change. Published campaigns were effectively uneditable.
--
-- FIX (field policy only; ownership, RLS, state machine and payments are
-- untouched):
--   1. Financial lock is now VALUE-AWARE: payout (-> clips.locked_cpm) and
--      max_payout_per_clip (-> clips.locked_max_payout) are rejected only
--      when the patch value actually differs from the stored value AND clips
--      exist. Same error message as before; an unchanged echo is a no-op.
--   2. Non-financial detail fields stay editable after publish/open, with or
--      without submissions (title, brief, category, objective, platforms,
--      start/end date, timezone, what_to_make, hook, cta,
--      recommended_duration, style, branding, source_link, source_assets,
--      thumbnails, brand_assets, niche, caption_req, aspect_ratio, do_list,
--      dont_list, example_clips, view_rules, approval, rights, rules,
--      spend_cap). Newly whitelisted columns: source_assets, example_clips,
--      do_list, dont_list.
--   3. Platform validation: values must be in the platform vocabulary
--      (YouTube / Instagram / Kick — same as campaigns_platform_check);
--      Kick may not be NEWLY selected (coming soon) but stays accepted when
--      already on the campaign, so existing rows stay editable and clip
--      submission compatibility is preserved.
--   4. Date validation: unparsable values and inverted ranges are rejected;
--      editing dates never changes campaign status.
--   5. Audit: every successful update appends an entry to campaigns.audit
--      (the trail the UI renders) and writes an audit_logs row
--      (action = campaign_updated). Nothing was removed.
--
-- PRESERVED EXACTLY:
--   - authentication / active-creator / ownership checks (steps 1-5)
--   - immutable field block, status block (state machine untouched)
--   - budget lock trigger (trg_enforce_campaign_budget_lock)
--   - payment verification triggers, clip locked_cpm / locked_max_payout
--   - RLS policies, SECURITY DEFINER + search_path pinning, signature
--     update_campaign(uuid, jsonb), GRANT to authenticated only
--
-- RUN AFTER: migrations/20250101000011_social_rls_hardening.sql
-- (and after admin-schema.sql on an existing environment).
--
-- NOT EXECUTED AGAINST SUPABASE — apply manually via the SQL Editor, then run
-- supabase/campaign-detail-edit-tests.sql (cases A-F) and
-- supabase/campaign-budget-lock-tests.sql (regression).
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- RPC: update_campaign — Secure server-side campaign update.
-- Enforces: authentication, ownership/admin, immutable fields, status lock,
-- platform + date validation, a value-aware financial field lock, and an
-- audit entry on every successful update.
--
-- NON-FINANCIAL DETAIL FIELDS stay editable after publish/open, including
-- when submissions already exist: title, brief, category, objective,
-- platforms, start/end date, timezone, what_to_make, hook, cta,
-- recommended_duration, style, branding, source_link, source_assets,
-- thumbnails, brand_assets, plus the other creative/detail fields already
-- supported by the Campaign model (niche, caption_req, aspect_ratio,
-- do_list, dont_list, example_clips, view_rules, approval, rights, rules,
-- spend_cap, budget, verified, spent, days_left).
--
-- FINANCIAL FIELDS stay protected: payout (feeds clips.locked_cpm) and
-- max_payout_per_clip (feeds clips.locked_max_payout) are blocked once the
-- campaign has submissions. The lock is value-aware: the edit modal echoes
-- the current values next to detail edits, so an unchanged echo is never a
-- change — only an actual financial change is rejected (with the same error
-- as before). Budget remains guarded by trg_enforce_campaign_budget_lock.
--
-- NOT changed here: ownership/authentication, RLS, state-machine RPCs
-- (campaign_action / publish / pause / ...), payment verification, clip
-- locked_cpm / locked_max_payout, and the update_campaign(uuid, jsonb)
-- signature (the client keeps calling it unchanged).
-- ---------------------------------------------------------------------------
create or replace function public.update_campaign(
  p_campaign_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_campaign record;
  v_is_admin boolean;
  v_update jsonb;
  v_result jsonb;
  v_set text;
  v_key text;
  v_field text;
  v_IMMUTABLE_FIELDS text[] := array[
    'id', 'created_by', 'created_at', 'archived_by', 'archived_at'
  ];
  -- Same vocabulary as campaigns_platform_check / clips_platform_check.
  v_PLATFORM_VOCAB text[] := array['YouTube', 'Instagram', 'Kick'];
  -- Platforms that may be newly selected (Kick is coming soon and stays
  -- disabled in the campaign wizard and the edit modal).
  v_PLATFORM_SELECTABLE text[] := array['YouTube', 'Instagram'];
  v_platform_name text;
  v_already_present boolean;
  v_patch_num numeric;
  v_start_date date;
  v_end_date date;
  v_actor text;
  v_changed jsonb;
  v_note text;
  v_audit jsonb;
  v_has_clips boolean;
begin
  -- 1. Require authenticated user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 2. Check admin status
  v_is_admin := public.is_admin();

  -- 3. Require active creator or admin
  if not v_is_admin then
    if not exists (
      select 1 from public.profiles
      where id = v_user_id and role = 'creator' and status = 'active'
    ) then
      raise exception 'Only active creators or admins can update campaigns';
    end if;
  end if;

  -- 4. Load the campaign
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if not found then
    raise exception 'Campaign not found: %', p_campaign_id;
  end if;

  -- 5. Creator can only update own campaigns
  if not v_is_admin and v_campaign.created_by != v_user_id then
    raise exception 'Not authorized to update this campaign';
  end if;

  -- 6. Block immutable fields
  for v_field in select unnest(v_IMMUTABLE_FIELDS)
  loop
    if p_patch ? v_field then
      raise exception 'Cannot update immutable field: %', v_field;
    end if;
  end loop;

  -- 7. Block status changes (use campaign_action/admin_campaign_action RPCs)
  if p_patch ? 'status' then
    raise exception 'Cannot change status through update. Use campaign_action RPC.';
  end if;

  -- 8. Platform validation (platforms are NOT a financial field, so they stay
  --    editable after publication — but only with valid values):
  --      * every value must come from the platform vocabulary used everywhere
  --        else (campaigns_platform_check / clips_platform_check);
  --      * Kick is coming soon: it may not be NEWLY selected (the creation
  --        wizard and the edit modal both keep it disabled), while a Kick
  --        value that is already on the campaign stays accepted so existing
  --        rows remain editable and clip submission compatibility holds.
  if p_patch ? 'platforms' then
    if jsonb_typeof(p_patch->'platforms') is distinct from 'array' then
      raise exception 'platforms must be a JSON array of platform names';
    end if;

    for v_platform_name in select jsonb_array_elements_text(p_patch->'platforms')
    loop
      if v_platform_name is null or v_platform_name = ''
         or not (v_platform_name = any (v_PLATFORM_VOCAB)) then
        raise exception 'Invalid platform: %. Allowed platforms: %',
          coalesce(v_platform_name, 'null'),
          array_to_string(v_PLATFORM_VOCAB, ', ');
      end if;

      v_already_present := false;
      if v_campaign.platforms is not null
         and jsonb_typeof(v_campaign.platforms) = 'array'
         and v_campaign.platforms ? v_platform_name then
        v_already_present := true;
      end if;

      if not (v_platform_name = any (v_PLATFORM_SELECTABLE))
         and not v_already_present then
        raise exception 'Platform % is coming soon and cannot be selected',
          v_platform_name;
      end if;
    end loop;
  end if;

  if p_patch ? 'platform' then
    v_platform_name := p_patch->>'platform';
    if v_platform_name is null or v_platform_name = ''
       or not (v_platform_name = any (v_PLATFORM_VOCAB)) then
      raise exception 'Invalid platform: %', coalesce(v_platform_name, 'null');
    end if;
    if not (v_platform_name = any (v_PLATFORM_SELECTABLE))
       and v_campaign.platform is distinct from v_platform_name then
      raise exception 'Platform % is coming soon and cannot be selected',
        v_platform_name;
    end if;
  end if;

  -- 9. Date validation: reject unparsable values and inverted ranges. An
  --    empty string clears the date. Editing dates never touches status.
  if p_patch ? 'startDate' then
    if nullif(btrim(p_patch->>'startDate'), '') is null then
      v_start_date := null;
    else
      begin
        v_start_date := btrim(p_patch->>'startDate')::date;
      exception when others then
        raise exception 'Invalid startDate: %', p_patch->>'startDate';
      end;
    end if;
  else
    v_start_date := v_campaign.start_date;
  end if;

  if p_patch ? 'endDate' then
    if nullif(btrim(p_patch->>'endDate'), '') is null then
      v_end_date := null;
    else
      begin
        v_end_date := btrim(p_patch->>'endDate')::date;
      exception when others then
        raise exception 'Invalid endDate: %', p_patch->>'endDate';
      end;
    end if;
  else
    v_end_date := v_campaign.end_date;
  end if;

  if v_start_date is not null and v_end_date is not null
     and v_end_date < v_start_date then
    raise exception 'Invalid date range: endDate (%) is before startDate (%)',
      to_char(v_end_date, 'YYYY-MM-DD'), to_char(v_start_date, 'YYYY-MM-DD');
  end if;

  -- 10. Financial field lock (value-aware). payout -> clips.locked_cpm and
  --     max_payout_per_clip -> clips.locked_max_payout, so both are locked
  --     once any submission exists. The edit modal always echoes the current
  --     values next to detail edits; only a value that actually differs from
  --     the stored one is treated as a financial change and rejected.
  if p_patch ? 'payout' then
    begin
      v_patch_num := (p_patch->>'payout')::numeric;
    exception when others then
      raise exception 'Invalid payout: %', p_patch->>'payout';
    end;

    if v_patch_num is null then
      raise exception 'Invalid payout: %',
        coalesce(p_patch->>'payout', 'null');
    end if;

    if v_patch_num is distinct from v_campaign.payout then
      select exists (
        select 1 from public.clips where campaign_id = p_campaign_id
      ) into v_has_clips;

      if v_has_clips then
        raise exception 'Cannot change payout on campaign with existing submissions. Create a new campaign with updated terms.';
      end if;
    end if;
  end if;

  if p_patch ? 'maxPayoutPerClip' then
    begin
      v_patch_num := (p_patch->>'maxPayoutPerClip')::numeric;
    exception when others then
      raise exception 'Invalid maxPayoutPerClip: %', p_patch->>'maxPayoutPerClip';
    end;

    if v_patch_num is distinct from v_campaign.max_payout_per_clip then
      select exists (
        select 1 from public.clips where campaign_id = p_campaign_id
      ) into v_has_clips;

      if v_has_clips then
        raise exception 'Cannot change max_payout_per_clip on campaign with existing submissions. Create a new campaign with updated terms.';
      end if;
    end if;
  end if;

  -- 11. Build safe update object (only known editable columns, raw values)
  --     Step 13 applies explicit type casts per column. Step 11 validates
  --     that values exist and filters to the whitelist only.
  v_update := '{}'::jsonb;
  if p_patch ? 'title' then v_update := v_update || jsonb_build_object('title', p_patch->>'title'); end if;
  if p_patch ? 'brief' then v_update := v_update || jsonb_build_object('brief', p_patch->>'brief'); end if;
  if p_patch ? 'platform' then v_update := v_update || jsonb_build_object('platform', p_patch->>'platform'); end if;
  if p_patch ? 'payout' then v_update := v_update || jsonb_build_object('payout', p_patch->>'payout'); end if;
  if p_patch ? 'niche' then v_update := v_update || jsonb_build_object('niche', p_patch->>'niche'); end if;
  if p_patch ? 'budget' then v_update := v_update || jsonb_build_object('budget', p_patch->>'budget'); end if;
  if p_patch ? 'spent' then v_update := v_update || jsonb_build_object('spent', p_patch->>'spent'); end if;
  if p_patch ? 'daysLeft' then v_update := v_update || jsonb_build_object('days_left', p_patch->>'daysLeft'); end if;
  if p_patch ? 'sourceLink' then v_update := v_update || jsonb_build_object('source_link', p_patch->>'sourceLink'); end if;
  if p_patch ? 'rules' then v_update := v_update || jsonb_build_object('rules', p_patch->>'rules'); end if;
  if p_patch ? 'category' then v_update := v_update || jsonb_build_object('category', p_patch->>'category'); end if;
  if p_patch ? 'platforms' then v_update := v_update || jsonb_build_object('platforms', p_patch->'platforms'); end if;
  if p_patch ? 'verified' then v_update := v_update || jsonb_build_object('verified', p_patch->>'verified'); end if;
  if p_patch ? 'objective' then v_update := v_update || jsonb_build_object('objective', p_patch->>'objective'); end if;
  -- Dates: use the validated/normalized values from step 9 (empty string
  -- clears the column instead of failing the cast).
  if p_patch ? 'startDate' then v_update := v_update || jsonb_build_object('start_date', v_start_date); end if;
  if p_patch ? 'endDate' then v_update := v_update || jsonb_build_object('end_date', v_end_date); end if;
  if p_patch ? 'maxPayoutPerClip' then v_update := v_update || jsonb_build_object('max_payout_per_clip', p_patch->>'maxPayoutPerClip'); end if;
  if p_patch ? 'recommendedDuration' then v_update := v_update || jsonb_build_object('recommended_duration', p_patch->>'recommendedDuration'); end if;
  if p_patch ? 'hook' then v_update := v_update || jsonb_build_object('hook', p_patch->>'hook'); end if;
  if p_patch ? 'captionReq' then v_update := v_update || jsonb_build_object('caption_req', p_patch->>'captionReq'); end if;
  if p_patch ? 'aspectRatio' then v_update := v_update || jsonb_build_object('aspect_ratio', p_patch->>'aspectRatio'); end if;
  if p_patch ? 'cta' then v_update := v_update || jsonb_build_object('cta', p_patch->>'cta'); end if;
  if p_patch ? 'branding' then v_update := v_update || jsonb_build_object('branding', p_patch->>'branding'); end if;
  if p_patch ? 'viewRules' then v_update := v_update || jsonb_build_object('view_rules', p_patch->'viewRules'); end if;
  if p_patch ? 'approval' then v_update := v_update || jsonb_build_object('approval', p_patch->'approval'); end if;
  if p_patch ? 'thumbnails' then v_update := v_update || jsonb_build_object('thumbnails', p_patch->'thumbnails'); end if;
  if p_patch ? 'brandAssets' then v_update := v_update || jsonb_build_object('brand_assets', p_patch->'brandAssets'); end if;
  if p_patch ? 'spendCap' then v_update := v_update || jsonb_build_object('spend_cap', p_patch->>'spendCap'); end if;
  if p_patch ? 'timezone' then v_update := v_update || jsonb_build_object('timezone', p_patch->>'timezone'); end if;
  if p_patch ? 'whatToMake' then v_update := v_update || jsonb_build_object('what_to_make', p_patch->>'whatToMake'); end if;
  if p_patch ? 'style' then v_update := v_update || jsonb_build_object('style', p_patch->>'style'); end if;
  if p_patch ? 'rights' then v_update := v_update || jsonb_build_object('rights', p_patch->'rights'); end if;
  -- Creative/detail fields already supported by the Campaign model.
  if p_patch ? 'sourceAssets' then v_update := v_update || jsonb_build_object('source_assets', p_patch->'sourceAssets'); end if;
  if p_patch ? 'exampleClips' then v_update := v_update || jsonb_build_object('example_clips', p_patch->'exampleClips'); end if;
  if p_patch ? 'doList' then v_update := v_update || jsonb_build_object('do_list', p_patch->'doList'); end if;
  if p_patch ? 'dontList' then v_update := v_update || jsonb_build_object('dont_list', p_patch->'dontList'); end if;

  -- Nothing to update
  if v_update = '{}'::jsonb then
    raise exception 'No valid fields to update';
  end if;

  -- 12. Build typed SET clause using explicit PostgreSQL casts.
  --     $2->>'key' returns TEXT; $2'key' returns JSONB.
  --     Neither can be assigned directly to numeric/integer/boolean/date columns.
  --     We must cast explicitly: ($2->>'key')::numeric, etc.
  --     JSONB columns use $2->'key' to preserve structure.
  v_set := '';
  for v_key in select jsonb_object_keys(v_update)
  loop
    if v_set <> '' then v_set := v_set || ', '; end if;

    v_set := v_set || case v_key
      -- NUMERIC columns
      WHEN 'budget'              THEN 'budget = ($2->>''budget'')::numeric'
      WHEN 'payout'              THEN 'payout = ($2->>''payout'')::numeric'
      WHEN 'spent'               THEN 'spent = ($2->>''spent'')::numeric'
      WHEN 'max_payout_per_clip' THEN 'max_payout_per_clip = ($2->>''max_payout_per_clip'')::numeric'
      WHEN 'spend_cap'           THEN 'spend_cap = ($2->>''spend_cap'')::numeric'
      -- INTEGER columns
      WHEN 'days_left'           THEN 'days_left = ($2->>''days_left'')::integer'
      -- BOOLEAN columns
      WHEN 'verified'            THEN 'verified = ($2->>''verified'')::boolean'
      -- DATE columns
      WHEN 'start_date'          THEN 'start_date = ($2->>''start_date'')::date'
      WHEN 'end_date'            THEN 'end_date = ($2->>''end_date'')::date'
      -- TEXT columns (->> returns text, no cast needed)
      WHEN 'title'               THEN 'title = $2->>''title'''
      WHEN 'brief'               THEN 'brief = $2->>''brief'''
      WHEN 'platform'            THEN 'platform = $2->>''platform'''
      WHEN 'niche'               THEN 'niche = $2->>''niche'''
      WHEN 'source_link'         THEN 'source_link = $2->>''source_link'''
      WHEN 'rules'               THEN 'rules = $2->>''rules'''
      WHEN 'category'            THEN 'category = $2->>''category'''
      WHEN 'objective'           THEN 'objective = $2->>''objective'''
      WHEN 'recommended_duration' THEN 'recommended_duration = $2->>''recommended_duration'''
      WHEN 'hook'                THEN 'hook = $2->>''hook'''
      WHEN 'caption_req'         THEN 'caption_req = $2->>''caption_req'''
      WHEN 'aspect_ratio'        THEN 'aspect_ratio = $2->>''aspect_ratio'''
      WHEN 'cta'                 THEN 'cta = $2->>''cta'''
      WHEN 'branding'            THEN 'branding = $2->>''branding'''
      WHEN 'timezone'            THEN 'timezone = $2->>''timezone'''
      WHEN 'what_to_make'        THEN 'what_to_make = $2->>''what_to_make'''
      WHEN 'style'               THEN 'style = $2->>''style'''
      -- JSONB columns (-> returns JSONB, assign directly)
      WHEN 'platforms'           THEN 'platforms = $2->''platforms'''
      WHEN 'view_rules'          THEN 'view_rules = $2->''view_rules'''
      WHEN 'approval'            THEN 'approval = $2->''approval'''
      WHEN 'thumbnails'          THEN 'thumbnails = $2->''thumbnails'''
      WHEN 'brand_assets'        THEN 'brand_assets = $2->''brand_assets'''
      WHEN 'rights'              THEN 'rights = $2->''rights'''
      WHEN 'source_assets'       THEN 'source_assets = $2->''source_assets'''
      WHEN 'example_clips'       THEN 'example_clips = $2->''example_clips'''
      WHEN 'do_list'             THEN 'do_list = $2->''do_list'''
      WHEN 'dont_list'           THEN 'dont_list = $2->''dont_list'''
      -- Unknown key — skip (should not happen due to whitelist above)
      ELSE NULL
    end;

  end loop;

  if v_set is null or v_set = '' then
    raise exception 'No valid fields to update';
  end if;

  -- 13. Audit: every successful update is recorded on the campaign audit
  --     trail (same entry shape the UI renders: action / by / at / note).
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
  into v_changed
  from jsonb_object_keys(v_update) k
  where coalesce(v_update ->> k, '') is distinct from
        coalesce(to_jsonb(v_campaign) ->> k, '');

  v_actor := coalesce(
    (select nullif(name, '') from public.profiles where id = v_user_id),
    (select nullif(email, '') from public.profiles where id = v_user_id),
    v_user_id::text
  );

  v_note := case
    when jsonb_array_length(v_changed) = 0 then 'Edited campaign'
    else 'Edited: ' || (
      select string_agg(f, ', ' order by f)
      from jsonb_array_elements_text(v_changed) f
    )
  end;

  v_audit := coalesce(v_campaign.audit, '[]'::jsonb);
  if jsonb_typeof(v_audit) is distinct from 'array' then
    v_audit := '[]'::jsonb;
  end if;
  v_audit := v_audit || jsonb_build_object(
    'action', 'edited',
    'by', v_actor,
    'at', (extract(epoch from now()) * 1000)::bigint,
    'note', v_note
  );

  -- 14. Perform the update with fully typed assignments + audit trail append
  execute format(
    'UPDATE public.campaigns SET %s, audit = $3 WHERE id = $1 RETURNING to_jsonb(campaigns.*)',
    v_set
  )
  into v_result
  using p_campaign_id, v_update, v_audit;

  -- 15. Global audit trail (same pattern as campaign_action / create_campaign)
  insert into public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    before_state, after_state, metadata, idempotency_key
  ) values (
    'audit-' || extract(epoch from now())::bigint || '-' || upper(md5(random()::text)),
    v_user_id,
    v_actor,
    'campaign_updated',
    'campaign',
    p_campaign_id::text,
    v_result->>'title',
    (select coalesce(jsonb_object_agg(f, to_jsonb(v_campaign) -> f), '{}'::jsonb)
       from jsonb_array_elements_text(v_changed) f),
    (select coalesce(jsonb_object_agg(f, v_result -> f), '{}'::jsonb)
       from jsonb_array_elements_text(v_changed) f),
    jsonb_build_object('fields', v_changed, 'source', 'update_campaign'),
    'campaign_update_' || p_campaign_id::text || '-' || extract(epoch from now())::bigint
      || '-' || upper(md5(random()::text))
  );

  return v_result;
end;
$$;

grant execute on function public.update_campaign(uuid, jsonb) to authenticated;
