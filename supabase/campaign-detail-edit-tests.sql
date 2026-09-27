-- ===========================================================================
-- CAMPAIGN DETAIL EDIT TESTS (update_campaign field policy)
-- ===========================================================================
-- Verifies migrations/20250101000012_update_campaign_detail_fields.sql:
--   A. published campaign, no submissions  -> detail edits succeed, CPM edit
--      follows the existing financial policy (allowed while no clips exist)
--   B. published campaign with submissions -> detail edits succeed (including
--      an unchanged financial echo), payout / max payout per clip rejected,
--      locked clip values untouched
--   C. a campaign the caller does not own -> rejected (ownership unchanged)
--   D. invalid platform                   -> rejected (Kick cannot be newly
--      selected, unknown values rejected)
--   E. invalid dates                      -> rejected; valid date edits never
--      change campaign status
--   F. state transitions                  -> still rejected through
--      update_campaign; campaign_action() still owns transitions
--
-- Requires these EXISTING auth.users / profiles (do not create users):
--   Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd (workclip11@gmail.com, role=admin)
--   Creator:   e92427b0-254e-44cc-b2df-be83792c8a94 (extra9898981212@gmail.com, role=creator)
--   Clipper:   890ad255-2d27-4f39-869c-32ba39a0e57e (york.manak111@gmail.com, role=clipper)
--
-- Tests use BEGIN/ROLLBACK so no data is persisted. No SAVEPOINT statements
-- (the SQL Editor runs the whole script in one implicit transaction).
-- ===========================================================================

-- ===========================================================================
-- CASE A: published campaign, no submissions
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_audit_len integer;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, budget,
    category, platforms, start_date, end_date, timezone,
    what_to_make, hook, cta, recommended_duration, style, branding,
    source_link, max_payout_per_clip, rules, spend_cap, view_rules,
    approval, rights, objective
  ) VALUES (
    'Detail Edit A', 'Original brief', 'YouTube', 400, 'Creator A', 5000,
    'Tech', '["YouTube"]'::jsonb, '2026-01-01', '2026-02-01', 'Asia/Kolkata',
    'Original what to make', 'Original hook', 'Original cta', '30 seconds', 'Fast', 'Original branding',
    'https://example.com/source', 600, 'No music', 10000,
    '{"minViews": 1000}'::jsonb,
    '{"autoReview": false}'::jsonb,
    '{"ads": false, "social": false, "website": false, "other": false}'::jsonb,
    'Awareness'
  ) RETURNING id INTO v_id;

  -- Publish the campaign the supported way: admin UPDATE sets status +
  -- launch_payment_status together (status changes stay RPC/trigger gated).
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  UPDATE public.campaigns
  SET status = 'open', launch_payment_status = 'verified'
  WHERE id = v_id;

  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  -- A1: every ordinary non-financial detail field is editable after publish
  PERFORM public.update_campaign(v_id, jsonb_build_object(
    'title', 'Detail Edit A - Updated',
    'brief', 'Updated brief',
    'category', 'Finance',
    'objective', 'Conversions',
    'platforms', jsonb_build_array('YouTube', 'Instagram'),
    'startDate', '2026-03-01',
    'endDate', '2026-04-01',
    'timezone', 'Europe/Berlin',
    'whatToMake', 'Updated what to make',
    'hook', 'Updated hook',
    'cta', 'Updated cta',
    'recommendedDuration', '45 seconds',
    'style', 'Calm',
    'branding', 'Updated branding',
    'sourceLink', 'https://example.com/updated-source',
    'thumbnails', jsonb_build_array('https://example.com/thumb.png'),
    'brandAssets', jsonb_build_array(jsonb_build_object('label', 'logo', 'url', 'https://example.com/logo.png')),
    'sourceAssets', jsonb_build_array(jsonb_build_object('label', 'brief', 'url', 'https://example.com/brief.pdf')),
    'doList', jsonb_build_array('Show the product'),
    'dontList', jsonb_build_array('No competitors'),
    'rules', 'No music, no profanity'
  ));

  ASSERT (SELECT title FROM public.campaigns WHERE id = v_id) = 'Detail Edit A - Updated',
    'CASE A1: title must be editable after publish';
  ASSERT (SELECT brief FROM public.campaigns WHERE id = v_id) = 'Updated brief',
    'CASE A1: brief must be editable after publish';
  ASSERT (SELECT category FROM public.campaigns WHERE id = v_id) = 'Finance',
    'CASE A1: category must be editable after publish';
  ASSERT (SELECT objective FROM public.campaigns WHERE id = v_id) = 'Conversions',
    'CASE A1: objective must be editable after publish';
  ASSERT (SELECT platforms FROM public.campaigns WHERE id = v_id) =
    '["YouTube", "Instagram"]'::jsonb,
    'CASE A1: platforms must be editable after publish';
  ASSERT (SELECT start_date FROM public.campaigns WHERE id = v_id) = '2026-03-01'::date,
    'CASE A1: start_date must be editable after publish';
  ASSERT (SELECT end_date FROM public.campaigns WHERE id = v_id) = '2026-04-01'::date,
    'CASE A1: end_date must be editable after publish';
  ASSERT (SELECT timezone FROM public.campaigns WHERE id = v_id) = 'Europe/Berlin',
    'CASE A1: timezone must be editable after publish';
  ASSERT (SELECT what_to_make FROM public.campaigns WHERE id = v_id) = 'Updated what to make',
    'CASE A1: what_to_make must be editable after publish';
  ASSERT (SELECT hook FROM public.campaigns WHERE id = v_id) = 'Updated hook',
    'CASE A1: hook must be editable after publish';
  ASSERT (SELECT cta FROM public.campaigns WHERE id = v_id) = 'Updated cta',
    'CASE A1: cta must be editable after publish';
  ASSERT (SELECT recommended_duration FROM public.campaigns WHERE id = v_id) = '45 seconds',
    'CASE A1: recommended_duration must be editable after publish';
  ASSERT (SELECT style FROM public.campaigns WHERE id = v_id) = 'Calm',
    'CASE A1: style must be editable after publish';
  ASSERT (SELECT branding FROM public.campaigns WHERE id = v_id) = 'Updated branding',
    'CASE A1: branding must be editable after publish';
  ASSERT (SELECT source_link FROM public.campaigns WHERE id = v_id) = 'https://example.com/updated-source',
    'CASE A1: source_link must be editable after publish';
  ASSERT (SELECT thumbnails FROM public.campaigns WHERE id = v_id) =
    '["https://example.com/thumb.png"]'::jsonb,
    'CASE A1: thumbnails must be editable after publish';
  ASSERT (SELECT brand_assets FROM public.campaigns WHERE id = v_id) =
    '[{"label": "logo", "url": "https://example.com/logo.png"}]'::jsonb,
    'CASE A1: brand_assets must be editable after publish';
  ASSERT (SELECT source_assets FROM public.campaigns WHERE id = v_id) =
    '[{"label": "brief", "url": "https://example.com/brief.pdf"}]'::jsonb,
    'CASE A1: source_assets must be editable after publish';
  ASSERT (SELECT do_list FROM public.campaigns WHERE id = v_id) =
    '["Show the product"]'::jsonb,
    'CASE A1: do_list must be editable after publish';
  ASSERT (SELECT dont_list FROM public.campaigns WHERE id = v_id) =
    '["No competitors"]'::jsonb,
    'CASE A1: dont_list must be editable after publish';
  ASSERT (SELECT rules FROM public.campaigns WHERE id = v_id) = 'No music, no profanity',
    'CASE A1: rules must stay editable (frontend asks for confirmation)';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'open',
    'CASE A1: editing details must not change campaign status';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'verified',
    'CASE A1: editing details must not change launch_payment_status';

  -- A2: audit entry is recorded on every successful update
  SELECT jsonb_array_length(coalesce(audit, '[]'::jsonb))
  INTO v_audit_len
  FROM public.campaigns WHERE id = v_id;
  ASSERT v_audit_len >= 1, 'CASE A2: campaigns.audit must record the update';

  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  ASSERT exists (
    select 1 from public.audit_logs
    where action = 'campaign_updated' and entity_id = v_id::text
  ), 'CASE A2: audit_logs must record campaign_updated';
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  -- A3: CPM edit with no submissions still follows the existing policy
  PERFORM public.update_campaign(v_id, jsonb_build_object('payout', 450));
  ASSERT (SELECT payout FROM public.campaigns WHERE id = v_id) = 450,
    'CASE A3: CPM edit must succeed while there are no submissions';
END $$;

SELECT 'CASE A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- CASE B: published campaign WITH submissions
-- ===========================================================================
BEGIN;
-- Fixture phase runs in the SQL Editor session role (RLS off for the fixture
-- inserts only): clips_insert requires an active clipper profile, and the
-- seeded clipper/creator identities differ between test suites. Every RPC call
-- and assertion below runs as authenticated Creator A.
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, budget,
    category, platforms, start_date, end_date,
    what_to_make, style, max_payout_per_clip, rules
  ) VALUES (
    'Detail Edit B', 'Original brief', 'YouTube', 400, 'Creator A', 5000,
    'Tech', '["YouTube"]'::jsonb, '2026-01-01', '2026-02-01',
    'Original what to make', 'Fast', 600, 'No music'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  UPDATE public.campaigns
  SET status = 'open', launch_payment_status = 'verified'
  WHERE id = v_id;

  -- A submission exists, with clip financial terms already locked
  INSERT INTO public.clips (
    campaign_id, user_id, clipper, caption, video_url, platform, status,
    locked_cpm, locked_max_payout
  ) VALUES (
    v_id, '890ad255-2d27-4f39-869c-32ba39a0e57e', 'Clipper One', 'My clip',
    'https://example.com/clip.mp4', 'YouTube', 'pending', 220, 500
  );

  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
END $$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_clip_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Detail Edit B'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;
  SELECT id INTO v_clip_id FROM public.clips WHERE campaign_id = v_id;

  ASSERT v_id IS NOT NULL, 'CASE B: fixture campaign not found';
  ASSERT v_clip_id IS NOT NULL, 'CASE B: fixture submission not found';

  -- B1: detail edits still succeed while the financial values are echoed back
  --     unchanged (this is the reported regression)
  PERFORM public.update_campaign(v_id, jsonb_build_object(
    'title', 'Detail Edit B - Updated',
    'brief', 'Updated brief',
    'category', 'Gaming',
    'objective', 'Awareness',
    'platforms', jsonb_build_array('YouTube'),
    'startDate', '2026-05-01',
    'endDate', '2026-06-01',
    'whatToMake', 'Updated what to make',
    'style', 'Calm',
    'branding', 'Updated branding',
    'hook', 'Updated hook',
    'cta', 'Updated cta',
    'recommendedDuration', '15 seconds',
    'timezone', 'Asia/Kolkata',
    'sourceLink', 'https://example.com/b',
    'thumbnails', jsonb_build_array('https://example.com/b.png'),
    'brandAssets', jsonb_build_array(jsonb_build_object('label', 'logo', 'url', 'https://example.com/b-logo.png')),
    'payout', 400,
    'maxPayoutPerClip', 600
  ));

  ASSERT (SELECT title FROM public.campaigns WHERE id = v_id) = 'Detail Edit B - Updated',
    'CASE B1: title must be editable with submissions present';
  ASSERT (SELECT brief FROM public.campaigns WHERE id = v_id) = 'Updated brief',
    'CASE B1: brief must be editable with submissions present';
  ASSERT (SELECT category FROM public.campaigns WHERE id = v_id) = 'Gaming',
    'CASE B1: category must be editable with submissions present';
  ASSERT (SELECT platforms FROM public.campaigns WHERE id = v_id) = '["YouTube"]'::jsonb,
    'CASE B1: platforms must be editable with submissions present';
  ASSERT (SELECT start_date FROM public.campaigns WHERE id = v_id) = '2026-05-01'::date,
    'CASE B1: start_date must be editable with submissions present';
  ASSERT (SELECT end_date FROM public.campaigns WHERE id = v_id) = '2026-06-01'::date,
    'CASE B1: end_date must be editable with submissions present';
  ASSERT (SELECT what_to_make FROM public.campaigns WHERE id = v_id) = 'Updated what to make',
    'CASE B1: creative details must be editable with submissions present';
  ASSERT (SELECT style FROM public.campaigns WHERE id = v_id) = 'Calm',
    'CASE B1: style must be editable with submissions present';
  ASSERT (SELECT branding FROM public.campaigns WHERE id = v_id) = 'Updated branding',
    'CASE B1: branding must be editable with submissions present';
  ASSERT (SELECT payout FROM public.campaigns WHERE id = v_id) = 400,
    'CASE B1: unchanged payout echo must be accepted';
  ASSERT (SELECT max_payout_per_clip FROM public.campaigns WHERE id = v_id) = 600,
    'CASE B1: unchanged max payout echo must be accepted';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'open',
    'CASE B1: status must stay open';

  -- B2: changing CPM with submissions present is rejected
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('payout', 999));
    ASSERT false, 'CASE B2: payout change must be rejected with submissions present';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change payout on campaign with existing submissions%',
      'CASE B2: wrong error: ' || SQLERRM;
  END;

  -- B3: changing max payout per clip with submissions present is rejected
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('maxPayoutPerClip', 999));
    ASSERT false, 'CASE B3: max payout change must be rejected with submissions present';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change max_payout_per_clip on campaign with existing submissions%',
      'CASE B3: wrong error: ' || SQLERRM;
  END;

  -- B4: the rejected attempts left everything untouched
  ASSERT (SELECT payout FROM public.campaigns WHERE id = v_id) = 400,
    'CASE B4: payout must be unchanged after rejected edits';
  ASSERT (SELECT max_payout_per_clip FROM public.campaigns WHERE id = v_id) = 600,
    'CASE B4: max_payout_per_clip must be unchanged after rejected edits';
  ASSERT (SELECT locked_cpm FROM public.clips WHERE id = v_clip_id) = 220,
    'CASE B4: clip locked_cpm must never change';
  ASSERT (SELECT locked_max_payout FROM public.clips WHERE id = v_clip_id) = 500,
    'CASE B4: clip locked_max_payout must never change';
END $$;

SELECT 'CASE B PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- CASE C: active creator editing a campaign they do not own
-- ===========================================================================
BEGIN;
-- Fixture insert runs in the SQL Editor session role (RLS applies only after
-- the role switch below): the fixture campaign is owned by the ADMIN account,
-- because campaigns_insert RLS only admits creator-role profiles.
SELECT set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, budget, status
  ) VALUES (
    'Detail Edit C', 'Original brief', 'YouTube', 400, 'Admin Fixture Owner', 5000, 'draft'
  ) RETURNING id INTO v_id;

  -- Active CREATOR (a real auth.users account) tries someone else's campaign
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('title', 'Hijacked'));
    ASSERT false, 'CASE C: another creator must not be able to update the campaign';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Not authorized to update this campaign%',
      'CASE C: wrong error: ' || SQLERRM;
  END;

  -- Back to the owner (admin) so RLS lets the assertion see the row
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  ASSERT (SELECT title FROM public.campaigns WHERE id = v_id) = 'Detail Edit C',
    'CASE C: campaign title must be unchanged';
END $$;

SELECT 'CASE C PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- CASE D: invalid platform values are rejected
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, budget, platforms
  ) VALUES (
    'Detail Edit D', 'Original brief', 'YouTube', 400, 'Creator A', 5000,
    '["YouTube"]'::jsonb
  ) RETURNING id INTO v_id;

  -- D1: unknown platform value
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('platforms', jsonb_build_array('TikTok')));
    ASSERT false, 'CASE D1: unknown platform must be rejected';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Invalid platform: TikTok%', 'CASE D1: wrong error: ' || SQLERRM;
  END;

  -- D2: Kick may not be newly selected (coming soon)
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('platforms', jsonb_build_array('YouTube', 'Kick')));
    ASSERT false, 'CASE D2: newly selecting Kick must be rejected';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%coming soon%', 'CASE D2: wrong error: ' || SQLERRM;
  END;

  -- D3: platforms must be an array
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('platforms', 'YouTube'));
    ASSERT false, 'CASE D3: non-array platforms must be rejected';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%platforms must be a JSON array%', 'CASE D3: wrong error: ' || SQLERRM;
  END;

  -- D4: single platform column is validated too
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('platform', 'Vimeo'));
    ASSERT false, 'CASE D4: invalid single platform must be rejected';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Invalid platform: Vimeo%', 'CASE D4: wrong error: ' || SQLERRM;
  END;

  -- D5: a valid platform edit still succeeds
  PERFORM public.update_campaign(v_id, jsonb_build_object('platforms', jsonb_build_array('Instagram')));
  ASSERT (SELECT platforms FROM public.campaigns WHERE id = v_id) = '["Instagram"]'::jsonb,
    'CASE D5: valid platform edit must succeed';
END $$;

SELECT 'CASE D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- CASE E: invalid dates are rejected; valid date edits never move status
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, budget,
    start_date, end_date
  ) VALUES (
    'Detail Edit E', 'Original brief', 'YouTube', 400, 'Creator A', 5000,
    '2026-01-01', '2026-02-01'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  UPDATE public.campaigns
  SET status = 'open', launch_payment_status = 'verified'
  WHERE id = v_id;
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  -- E1: unparsable start date
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('startDate', 'not-a-date'));
    ASSERT false, 'CASE E1: invalid startDate must be rejected';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Invalid startDate%', 'CASE E1: wrong error: ' || SQLERRM;
  END;

  -- E2: unparsable end date
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('endDate', '01/02/2026'));
    ASSERT false, 'CASE E2: invalid endDate must be rejected';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Invalid endDate%', 'CASE E2: wrong error: ' || SQLERRM;
  END;

  -- E3: inverted range
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object(
      'startDate', '2026-06-01', 'endDate', '2026-05-01'
    ));
    ASSERT false, 'CASE E3: end date before start date must be rejected';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Invalid date range%', 'CASE E3: wrong error: ' || SQLERRM;
  END;

  -- E4: valid date edit succeeds and never changes status as a side effect
  PERFORM public.update_campaign(v_id, jsonb_build_object(
    'startDate', '2026-07-01', 'endDate', '2026-08-01'
  ));
  ASSERT (SELECT start_date FROM public.campaigns WHERE id = v_id) = '2026-07-01'::date,
    'CASE E4: startDate must be updated';
  ASSERT (SELECT end_date FROM public.campaigns WHERE id = v_id) = '2026-08-01'::date,
    'CASE E4: endDate must be updated';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'open',
    'CASE E4: editing dates must not change campaign status';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'verified',
    'CASE E4: editing dates must not change launch payment status';
END $$;

SELECT 'CASE E PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- CASE F: state transitions still rejected through update_campaign;
--         campaign_action() still owns them
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, budget
  ) VALUES (
    'Detail Edit F', 'Original brief', 'YouTube', 400, 'Creator A', 5000
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  UPDATE public.campaigns
  SET status = 'open', launch_payment_status = 'verified'
  WHERE id = v_id;
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  -- F1: status can never be moved through update_campaign
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('status', 'closed'));
    ASSERT false, 'CASE F1: status change through update_campaign must be rejected';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change status through update%',
      'CASE F1: wrong error: ' || SQLERRM;
  END;

  -- F2: immutable fields still blocked
  BEGIN
    PERFORM public.update_campaign(v_id, jsonb_build_object('created_by', '890ad255-2d27-4f39-869c-32ba39a0e57e'));
    ASSERT false, 'CASE F2: created_by change must be rejected';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot update immutable field%', 'CASE F2: wrong error: ' || SQLERRM;
  END;

  -- F3: the state machine RPC still owns transitions
  PERFORM public.campaign_action(v_id, 'pause');
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'paused',
    'CASE F3: campaign_action(pause) must still work';

  -- F4: detail edits remain possible after the transition
  PERFORM public.update_campaign(v_id, jsonb_build_object('title', 'Detail Edit F - Updated'));
  ASSERT (SELECT title FROM public.campaigns WHERE id = v_id) = 'Detail Edit F - Updated',
    'CASE F4: detail edit after pause must succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'paused',
    'CASE F4: detail edit must not move status back';
END $$;

SELECT 'CASE F PASSED' AS result;
ROLLBACK;
