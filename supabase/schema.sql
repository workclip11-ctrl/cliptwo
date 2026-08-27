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
  submitted_at timestamptz not null default now()
);

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

insert into public.campaigns (id, title, creator, niche, brief, platform, payout, status, budget, spent, days_left, source_link, rules)
values
  ('11111111-1111-1111-1111-111111111111', 'Launch teaser for our new app', 'Northwind Labs', 'Tech', 'Cut a 20s hook from the keynote.', 'Instagram', 220, 'open', 40000, 4048, 12, 'https://drive.google.com/drive/folders/launch-teaser', 'No watermarks.'),
  ('22222222-2222-2222-2222-222222222222', 'Workout routine highlight', 'FitForm', 'Fitness', 'Turn the 12-min session into 3 reels.', 'Reels', 160, 'open', 25000, 1920, 26, 'https://drive.google.com/drive/folders/workout-routine', 'Vertical only.'),
  ('33333333-3333-3333-3333-333333333333', 'Founder story short', 'Maker House', 'Finance', 'Use the intro monologue.', 'YouTube', 280, 'open', 60000, 0, 9, 'https://drive.google.com/drive/folders/founder-story', 'Vertical 9:16 only.'),
  ('44444444-4444-4444-4444-444444444444', 'Stand-up Set - Delhi Live', 'Kabir Sethi', 'Comedy', 'Punchline-first cuts, 20-40s max.', 'Reels', 190, 'open', 30000, 0, 14, 'https://drive.google.com/drive/folders/delhi-live', 'No profanity in captions.');

insert into public.clips (campaign_id, clipper, caption, video_url, platform, views, status)
values
  ('11111111-1111-1111-1111-111111111111', 'maya.cuts', 'This app is unhinged #tech', 'https://instagram.com/reel/xk29a', 'Instagram', 18400, 'approved'),
  ('11111111-1111-1111-1111-111111111111', 'devon.edits', 'The keynote moment everyone missed', 'https://youtube.com/shorts/8kd92', 'YouTube', 0, 'pending'),
  ('22222222-2222-2222-2222-222222222222', 'maya.cuts', '3 moves that fixed my posture', 'https://instagram.com/reel/pw001', 'Instagram', 0, 'pending');
