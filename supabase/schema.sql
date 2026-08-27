-- cliptwo Supabase schema
-- Run this in Supabase Dashboard -> SQL Editor -> Run.

-- =========================================================================
-- Table: campaigns  (created by creators)
-- =========================================================================
create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users (id) on delete set null,
  title       text not null,
  creator     text not null,
  niche      text,
  brief      text not null,
  platform    text not null,
  payout      numeric not null default 0,     -- CPM: ₹ per 1,000 verified views
  status      text not null default 'open',   -- open | closed
  budget      numeric not null default 0,
  spent       numeric not null default 0,
  days_left   integer not null default 30,
  source_link text,
  rules       text,
  created_at  timestamptz not null default now()
);

-- =========================================================================
-- Table: clips  (submitted by clippers)
-- =========================================================================
create table if not exists public.clips (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.campaigns (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  clipper      text not null,
  caption      text not null,
  video_url    text not null,
  platform     text not null,
  views        integer not null default 0,
  status       text not null default 'pending', -- pending | approved | rejected
  submitted_at timestamptz not null default now()
);

-- =========================================================================
-- Row Level Security
-- NOTE: prototype-grade. Campaigns are publicly readable (browse/featured);
-- writes are scoped to the owner. Clips are publicly readable (creator review)
-- and any authenticated user may update them so creators can approve/reject.
-- Tighten these before production.
-- =========================================================================
alter table public.campaigns enable row level security;
alter table public.clips enable row level security;

-- campaigns: public read, owner write
drop policy if exists "campaigns_select" on public.campaigns;
create policy "campaigns_select" on public.campaigns
  for select using (true);

drop policy if exists "campaigns_insert" on public.campaigns;
create policy "campaigns_insert" on public.campaigns
  for insert with check (auth.uid() = created_by);

drop policy if exists "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns
  for update using (auth.uid() = created_by);

drop policy if exists "campaigns_delete" on public.campaigns;
create policy "campaigns_delete" on public.campaigns
  for delete using (auth.uid() = created_by);

-- clips: public read, owner insert, authenticated update/delete
drop policy if exists "clips_select" on public.clips;
create policy "clips_select" on public.clips
  for select using (true);

drop policy if exists "clips_insert" on public.clips;
create policy "clips_insert" on public.clips
  for insert with check (auth.uid() = user_id);

drop policy if exists "clips_update" on public.clips;
create policy "clips_update" on public.clips
  for update using (auth.role() = 'authenticated');

drop policy if exists "clips_delete" on public.clips;
create policy "clips_delete" on public.clips
  for delete using (auth.role() = 'authenticated');

-- =========================================================================
-- Seed data (only if tables are empty)
-- =========================================================================
insert into public.campaigns (title, creator, niche, brief, platform, payout, status, budget, spent, days_left, source_link, rules)
select * from (values
  ('Launch teaser for our new app', 'Northwind Labs', 'Tech', 'Cut a 20s hook from the keynote. Punchy, fast-paced, end on CTA.', 'Instagram', 220, 'open', 40000, 4048, 12, 'https://drive.google.com/drive/folders/launch-teaser', 'Cut a 20s hook from the keynote. Punchy, fast-paced, end on CTA. No watermarks.'),
  ('Workout routine highlight', 'FitForm', 'Fitness', 'Turn the 12-min session into 3 separate 30s reels. Vertical only.', 'Reels', 160, 'open', 25000, 1920, 26, 'https://drive.google.com/drive/folders/workout-routine', 'Turn the 12-min session into 3 separate 30s reels. Vertical only. Upbeat music.'),
  ('Founder story short', 'Maker House', 'Finance', 'Use the intro monologue. Emotional, cinematic, subtitles on.', 'YouTube', 280, 'open', 60000, 0, 9, 'https://drive.google.com/drive/folders/founder-story', 'Vertical 9:16 only. Keep the monologue intact. English subtitles required.'),
  ('Stand-up Set — Delhi Live', 'Kabir Sethi', 'Comedy', 'Punchline-first cuts, 20-40s max. Keep crowd reactions in.', 'Reels', 190, 'open', 30000, 0, 14, 'https://drive.google.com/drive/folders/delhi-live', 'No profanity in captions. 20-40s clips. Add a hook in the first 3 seconds.')
) as seed(title, creator, niche, brief, platform, payout, status, budget, spent, days_left, source_link, rules)
where not exists (select 1 from public.campaigns);

insert into public.clips (campaign_id, clipper, caption, video_url, platform, views, status)
select c.id, v.clipper, v.caption, v.video_url, v.platform, v.views, v.status
from public.campaigns c
cross join (values
  ('maya.cuts', 'This app is unhinged 🔥 #tech', 'https://instagram.com/reel/xk29a', 'Instagram', 18400, 'approved'),
  ('devon.edits', 'The keynote moment everyone missed', 'https://youtube.com/shorts/8kd92', 'YouTube', 0, 'pending'),
  ('maya.cuts', '3 moves that fixed my posture', 'https://instagram.com/reel/pw001', 'Instagram', 0, 'pending')
) as v(clipper, caption, video_url, platform, views, status)
where c.title = 'Launch teaser for our new app' and not exists (select 1 from public.clips);
