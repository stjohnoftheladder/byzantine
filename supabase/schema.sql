-- Fellowship Go — mid-term data model (pan-Orthodox)
-- Run in the Supabase SQL editor (project qdgojvbzxnasqyybsxjg) or `supabase db push`.
-- Design: no auth/accounts. Anon access with row-level security; identity stays
-- a client-generated player_id (localStorage UUID) synced here.

-- Parishes ----------------------------------------------------------------
create table if not exists public.parishes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- stable link key, e.g. 'ss-george-alexandra'
  name        text not null,                 -- display name
  location    text,                          -- city, state
  created_at  timestamptz not null default now()
);

-- Meets (one or more per parish; pilot uses one upcoming meet) ------------
create table if not exists public.meets (
  id          uuid primary key default gen_random_uuid(),
  parish_id   uuid not null references public.parishes (id) on delete cascade,
  title       text not null,                 -- e.g. 'Fourth Friday Parish Meet'
  meet_date   date not null,
  meet_time   text not null,                 -- '7:30 PM' (display; TZ handled in app)
  notes       text,
  created_at  timestamptz not null default now()
);

-- RSVPs -------------------------------------------------------------------
create table if not exists public.rsvps (
  id          uuid primary key default gen_random_uuid(),
  meet_id     uuid not null references public.meets (id) on delete cascade,
  player_id   text not null,                 -- client-generated identity (localStorage UUID)
  name        text not null,                 -- first name, as entered
  created_at  timestamptz not null default now(),
  unique (meet_id, player_id)                -- one RSVP per person per meet
);

-- Indexes -----------------------------------------------------------------
create index if not exists meets_parish_date_idx on public.meets (parish_id, meet_date desc);
create index if not exists rsvps_meet_idx     on public.rsvps (meet_id);

-- Row-level security ------------------------------------------------------
alter table public.parishes enable row level security;
alter table public.meets    enable row level security;
alter table public.rsvps    enable row level security;

-- Anyone (anon) may read parish and meet info
drop policy if exists "parishes readable by all" on public.parishes;
create policy "parishes readable by all" on public.parishes
  for select using (true);

drop policy if exists "meets readable by all" on public.meets;
create policy "meets readable by all" on public.meets
  for select using (true);

-- Attendee lists are public within the app (first names only, opt-in by joining)
drop policy if exists "rsvps readable by all" on public.rsvps;
create policy "rsvps readable by all" on public.rsvps
  for select using (true);

-- Anyone may RSVP (identity is client-generated; no accounts)
drop policy if exists "anyone may rsvp" on public.rsvps;
create policy "anyone may rsvp" on public.rsvps
  for insert with check (true);

-- Note: no update/delete policies — an RSVP is permanent once created,
-- matching the pilot behavior (RSVP toggles off is a future option).
