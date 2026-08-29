-- cliptwo Supabase schema
-- Run this in Supabase Dashboard -> SQL Editor -> Run.
-- NOTE: this drops and recreates the tables, so any existing data is reset.

drop table if exists public.clips;
drop table if exists public.campaigns;

create table public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users (id) on delete set null,
  title       text not null,
  creator     text not null,
  niche       text,
  brief       text not null,
  platform    text not null,
  payout      numeric not null default 0,
  status      text not null default 'open',
  budget      numeric not null default 0,
  spent       numeric not null default 0,
  days_left   integer not null default 30,
  source_link text,
  rules       text,
  category    text,
  platforms   jsonb,
  verified    boolean,
  objective   text,
  start_date  date,
  end_date    date,
  max_payout_per_clip numeric,
  recommended_duration text,
  hook        text,
  caption_req text,
  aspect_ratio text,
  cta         text,
  branding    text,
  do_list     jsonb,
  dont_list   jsonb,
  source_assets jsonb,
  example_clips jsonb,
  view_rules  jsonb,
  approval    jsonb,
  thumbnails  jsonb,
  brand_assets jsonb,
  spend_cap   numeric,
  timezone    text,
  what_to_make text,
  style       text,
  rights      jsonb,
  created_at  timestamptz not null default now()
);

create table public.clips (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.campaigns (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  clipper      text not null,
  caption      text not null,
  video_url    text not null,
  platform     text not null,
  views        integer not null default 0,
  status       text not null default 'pending',
  submitted_at timestamptz not null default now(),
  rejection_reason text,
  rejection_details text,
  failure_reason text,
  engagement    jsonb,
  audit         jsonb
);

-- ---------------------------------------------------------------------------
-- social_accounts — a clipper's connected publishing platforms.
-- SECURITY: this table stores ONLY non-secret metadata (handle, status, etc).
-- OAuth access tokens / client secrets / service-role keys MUST NEVER be stored
-- here or exposed to the browser. Real platform credentials belong in a
-- server-only secret store (e.g. a Supabase Vault secret or encrypted column
-- with RLS forbidding SELECT) and are read exclusively by backend jobs that
-- later power view tracking. The client never receives them.
-- ---------------------------------------------------------------------------
drop table if exists public.social_accounts;
create table public.social_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  platform      text not null,
  handle        text not null,
  status        text not null default 'not_connected',
  verified      boolean not null default false,
  connected_at  timestamptz,
  last_sync_at  timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);

alter table public.social_accounts enable row level security;

drop policy if exists "social_accounts_select" on public.social_accounts;
create policy "social_accounts_select" on public.social_accounts
  for select using (auth.uid() = user_id);

drop policy if exists "social_accounts_insert" on public.social_accounts;
create policy "social_accounts_insert" on public.social_accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "social_accounts_update" on public.social_accounts;
create policy "social_accounts_update" on public.social_accounts
  for update using (auth.uid() = user_id);

drop policy if exists "social_accounts_delete" on public.social_accounts;
create policy "social_accounts_delete" on public.social_accounts
  for delete using (auth.uid() = user_id);

alter table public.campaigns enable row level security;
alter table public.clips enable row level security;

drop policy if exists "campaigns_select" on public.campaigns;
create policy "campaigns_select" on public.campaigns for select using (true);

drop policy if exists "campaigns_insert" on public.campaigns;
create policy "campaigns_insert" on public.campaigns for insert with check (auth.uid() = created_by);

drop policy if exists "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns for update using (auth.uid() = created_by);

drop policy if exists "campaigns_delete" on public.campaigns;
create policy "campaigns_delete" on public.campaigns for delete using (auth.uid() = created_by);

drop policy if exists "clips_select" on public.clips;
create policy "clips_select" on public.clips for select using (true);

drop policy if exists "clips_insert" on public.clips;
create policy "clips_insert" on public.clips for insert with check (auth.uid() = user_id);

drop policy if exists "clips_update" on public.clips;
create policy "clips_update" on public.clips for update using (auth.role() = 'authenticated');

drop policy if exists "clips_delete" on public.clips;
create policy "clips_delete" on public.clips for delete using (auth.role() = 'authenticated');

insert into public.campaigns (id, title, creator, niche, brief, platform, payout, status, budget, spent, days_left, source_link, rules, category, platforms, verified, objective, start_date, end_date, max_payout_per_clip, recommended_duration, hook, caption_req, aspect_ratio, cta, branding, do_list, dont_list, source_assets, example_clips, view_rules, approval)
values
  ('11111111-1111-1111-1111-111111111111', 'Launch teaser for our new app', 'Northwind Labs', 'Tech', 'Cut a 20s hook from the keynote.', 'Instagram', 220, 'open', 40000, 4048, 12, 'https://drive.google.com/drive/folders/launch-teaser', 'No watermarks.', 'Tech', '["Instagram","YouTube","TikTok"]'::jsonb, true, 'Drive pre-launch awareness for our new productivity app.', '2026-08-21', '2026-09-10', 5000, '15–30s', 'Open with the ''this app is unhinged'' moment in the first 3 seconds.', 'English caption + 3 hashtags (#productivity #app #tech). Subtitles on.', '9:16 vertical', 'Link in bio to install ClipTwo.', 'Keep our logo in the last 2s. No competitor mentions.', '["Use the official keynote footage","Show a real, relatable use-case","Fast cuts under 1s between beats"]'::jsonb, '["No watermarks or other brand logos","No fake engagement or bots","Don''t misrepresent app features"]'::jsonb, '[{"label":"Keynote raw (Drive)","url":"https://drive.google.com/drive/folders/launch-teaser"}]'::jsonb, '[]'::jsonb, '{"verifiedView":"A view counts when watched past 3s by a unique account.","whenCounted":"Counted 48h after the post goes live.","updateFrequency":"Refreshed every 24h.","minViews":1000,"maxPayout":5000,"deletedPolicy":"If the post is deleted or set private, earnings are reversed.","payableWhen":"Becomes payable once approved and views stabilise (48h)."}'::jsonb, '{"afterSubmission":"You''ll get a submission ticket linked to this campaign.","reviewTime":"Within 48 hours.","criteria":"Original, on-brief, vertical, clear hook in first 3s.","rejectionReasons":["Watermark","Off-brief","Low retention"],"appeal":"Reply to the decision email within 7 days."}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'Workout routine highlight', 'FitForm', 'Fitness', 'Turn the 12-min session into 3 reels.', 'Reels', 160, 'open', 25000, 0, 26, 'https://drive.google.com/drive/folders/workout-routine', 'Vertical only.', 'Fitness', '["Reels","Instagram","TikTok"]'::jsonb, true, 'Repurpose our 12-minute workout into snackable reels that people finish and save.', '2026-08-22', '2026-09-30', 3000, '25–35s', 'Show the result first (better posture) then the move.', 'Upbeat tone, mention @fitform, add #homeworkout.', '9:16 vertical', 'Save this routine and follow @fitform.', 'Keep ''FitForm'' lower-third for 3s.', '["Make 3 separate reels from the session","Use trending fitness audio","Show before/after posture"]'::jsonb, '["No horizontal footage","No medical claims","No other gym tags"]'::jsonb, '[{"label":"Full session (Drive)","url":"https://drive.google.com/drive/folders/workout-routine"}]'::jsonb, '[]'::jsonb, '{"verifiedView":"Unique view past 5s with sound on.","whenCounted":"Counted 24h after posting.","updateFrequency":"Every 12h.","minViews":500,"maxPayout":3000,"deletedPolicy":"Private or deleted posts forfeit earnings.","payableWhen":"Payable 24h after approval."}'::jsonb, '{"afterSubmission":"Ticket created under your clipper profile.","reviewTime":"Within 24 hours.","criteria":"Vertical, on-brand, clear transformation.","rejectionReasons":["Horizontal","Off-brand","Medical claim"],"appeal":"Open a help ticket within 5 days."}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'Founder story short', 'Maker House', 'Finance', 'Use the intro monologue.', 'YouTube', 280, 'open', 60000, 0, 9, 'https://drive.google.com/drive/folders/founder-story', 'Vertical 9:16 only.', 'Finance', '["YouTube","Instagram","TikTok"]'::jsonb, false, 'Make our founder''s origin story land with first-time founders and builders.', '2026-08-16', '2026-09-09', 8000, '30–60s', 'Start on the emotional line, not the logo.', 'English subtitles required. Keep monologue intact.', '9:16 vertical', 'Follow Maker House for build diaries.', 'Subtle Maker House lower-third, no outro splash.', '["Keep the monologue intact","Cinematic grade, stable shots","Burn-in English subtitles"]'::jsonb, '["Don''t cut the monologue","No fake subtitles","No stock footage"]'::jsonb, '[{"label":"Founder interview (Drive)","url":"https://drive.google.com/drive/folders/founder-story"}]'::jsonb, '[]'::jsonb, '{"verifiedView":"Unique viewer past 10s.","whenCounted":"Counted 72h after posting.","updateFrequency":"Every 24h.","minViews":2000,"maxPayout":8000,"deletedPolicy":"Deleted posts reverse all earnings.","payableWhen":"Payable 72h after approval."}'::jsonb, '{"afterSubmission":"Ticket created, reviewed by brand team.","reviewTime":"Within 72 hours.","criteria":"Cinematic, intact monologue, correct subtitles.","rejectionReasons":["Cut monologue","No subtitles","Reused stock"],"appeal":"Email founders@makerhouse within 7 days."}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'Stand-up Set — Delhi Live', 'Kabir Sethi', 'Comedy', 'Punchline-first cuts, 20-40s max.', 'Reels', 190, 'open', 30000, 0, 14, 'https://drive.google.com/drive/folders/delhi-live', 'No profanity in captions.', 'Comedy', '["Reels","Instagram","TikTok"]'::jsonb, false, 'Turn the Delhi live set into viral punchline cuts that grow the comic''s following.', '2026-08-19', '2026-09-12', 4000, '20–40s', 'Lead with the punchline, keep the crowd laugh.', 'No profanity in captions. Add #standup.', '9:16 vertical', 'Follow Kabir Sethi for tour dates.', 'Keep ''Kabir Sethi'' tag for 2s.', '["Punchline-first edits","Keep crowd reactions","20–40s clips"]'::jsonb, '["No profanity in captions","No long setups","No other comic tags"]'::jsonb, '[{"label":"Full set (Drive)","url":"https://drive.google.com/drive/folders/delhi-live"}]'::jsonb, '[]'::jsonb, '{"verifiedView":"Unique view past 5s.","whenCounted":"Counted 48h after posting.","updateFrequency":"Every 24h.","minViews":1000,"maxPayout":4000,"deletedPolicy":"Deleted or private posts forfeit earnings.","payableWhen":"Payable 48h after approval."}'::jsonb, '{"afterSubmission":"Ticket created under your profile.","reviewTime":"Within 48 hours.","criteria":"Funny, punchline-first, clean captions.","rejectionReasons":["Profanity","Too long","No laugh"],"appeal":"Help ticket within 5 days."}'::jsonb);

insert into public.clips (campaign_id, clipper, caption, video_url, platform, views, status, rejection_reason, rejection_details, failure_reason)
values
  ('11111111-1111-1111-1111-111111111111', 'maya.cuts', 'This app is unhinged #tech', 'https://instagram.com/reel/xk29a', 'Instagram', 18400, 'paid', null, null, null),
  ('11111111-1111-1111-1111-111111111111', 'devon.edits', 'The keynote moment everyone missed', 'https://youtube.com/shorts/8kd92', 'YouTube', 0, 'pending', null, null, null),
  ('22222222-2222-2222-2222-222222222222', 'maya.cuts', '3 moves that fixed my posture', 'https://instagram.com/reel/pw001', 'Instagram', 0, 'pending', null, null, null),
  ('11111111-1111-1111-1111-111111111111', 'maya.cuts', 'The keynote but with a loud soundtrack', 'https://instagram.com/reel/xk44b', 'Instagram', 6200, 'rejected', 'Campaign rule violation', 'Background music was not allowed for this campaign.', null),
  ('11111111-1111-1111-1111-111111111111', 'maya.cuts', '3 quick takes from the keynote', 'https://instagram.com/reel/xk51p', 'Instagram', 9100, 'failed', null, null, 'UPI verification failed — the UPI ID could not be verified. Update your payment method and retry.');
