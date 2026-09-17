-- 545-coaching: initial schema.
--
-- Two parallel identity tables, athletes and coaches, both keyed straight to
-- auth.users — a person can have a row in either or both, since a coach who
-- also logs their own training is common, not an edge case. What someone can
-- see is decided entirely by athlete_memberships / coach_assignments plus
-- the row-level security policies at the bottom, not by which identity
-- table they happen to be in.

create extension if not exists "pgcrypto";

-- --- Identity -----------------------------------------------------------

create table athletes (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table coaches (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- --- Clubs and programs ---------------------------------------------------

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references coaches (id),
  created_at timestamptz not null default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- An athlete's membership. program_id null means "in the club but not yet
-- assigned to a program" rather than "oversees the whole club" — that
-- reading belongs to coach_assignments, not this table.
create table athlete_memberships (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  club_id uuid not null references clubs (id) on delete cascade,
  program_id uuid references programs (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index athlete_memberships_one_per_club
  on athlete_memberships (athlete_id, club_id, coalesce(program_id, '00000000-0000-0000-0000-000000000000'));

-- A coach's assignment. program_id null DOES mean "oversees the whole
-- club" here — a head coach doesn't need one row per program.
create table coach_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id) on delete cascade,
  club_id uuid not null references clubs (id) on delete cascade,
  program_id uuid references programs (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index coach_assignments_one_per_scope
  on coach_assignments (coach_id, club_id, coalesce(program_id, '00000000-0000-0000-0000-000000000000'));

-- A parent/guardian's view of one specific athlete — deliberately NOT
-- club/program-scoped like coach_assignments above. A club coach oversees a
-- roster through the club's structure; a parent oversees one kid regardless
-- of what club or program they're in, and that relationship shouldn't need
-- a club to exist at all (a parent watching a junior athlete's home
-- practice, no club involved yet, is a completely normal case).
create table guardian_links (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);

-- --- Training data ---------------------------------------------------------
-- Shape lifted close to verbatim from the app's existing local types
-- (src/lib/types.ts) — Workout, Bout, MetalBout were already modelling the
-- domain correctly, they just need an owner and a table instead of an
-- IndexedDB key.

create table workouts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  started_at timestamptz not null,
  name text not null default '',
  wind text not null default 'none' check (wind in ('none', 'light', 'moderate', 'strong')),
  wind_direction text not null default '12',
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Normalized out of Workout.clickLog into its own table — a workout's click
-- log was always an array of independent entries, never edited as a unit.
create table click_adjustments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  logged_at timestamptz not null default now(),
  vertical int not null default 0,
  vertical_dir text not null default 'up' check (vertical_dir in ('up', 'down')),
  horizontal int not null default 0,
  horizontal_dir text not null default 'left' check (horizontal_dir in ('left', 'right')),
  note text not null default ''
);

create table bouts (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  -- Denormalized alongside workout_id so RLS policies (and coach roster
  -- queries) don't need a join through workouts for every row check.
  athlete_id uuid not null references athletes (id) on delete cascade,
  shot_at timestamptz not null,
  position text not null check (position in ('prone', 'standing')),
  target_face_id text not null,
  bullet_diameter_mm numeric not null,
  expected_shots int not null default 10,
  -- Path into Supabase Storage, not a blob — photos are disposable evidence
  -- once scored, same reasoning the local app already uses for IndexedDB.
  image_path text,
  mm_per_unit numeric,
  -- Shots and cached metrics are always read and written as one unit for
  -- one bout, never queried shot-by-shot across bouts — JSON is the right
  -- shape here, unlike the per-target columns below.
  shots jsonb not null default '[]',
  metrics jsonb,
  skied_in boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table metal_bouts (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  shot_at timestamptz not null,
  position text not null check (position in ('prone', 'standing')),
  -- Five real columns, not a JSON blob: the entire point of tracking this
  -- per-target is "which target does the whole program miss most", which
  -- is a GROUP BY over real columns, not unpacking JSON per row.
  hit_alpha boolean not null default false,
  hit_beta boolean not null default false,
  hit_charlie boolean not null default false,
  hit_delta boolean not null default false,
  hit_echo boolean not null default false,
  heart_rate int not null default 0,
  combo_id uuid,
  created_at timestamptz not null default now()
);

-- --- Row-level security -----------------------------------------------------

alter table athletes enable row level security;
alter table coaches enable row level security;
alter table clubs enable row level security;
alter table programs enable row level security;
alter table athlete_memberships enable row level security;
alter table coach_assignments enable row level security;
alter table guardian_links enable row level security;
alter table workouts enable row level security;
alter table click_adjustments enable row level security;
alter table bouts enable row level security;
alter table metal_bouts enable row level security;

-- One predicate, used by every "can this coach see this athlete's data"
-- policy below, so the club-coach path and the parent path stay defined in
-- exactly one place instead of six near-identical EXISTS clauses that could
-- quietly drift apart. security definer so the function can read
-- athlete_memberships / coach_assignments / guardian_links on the caller's
-- behalf regardless of what RLS would otherwise let that caller see on
-- those tables directly. An athlete can have both a club coach and a parent
-- at once — the two paths are independent, either one is enough.
create or replace function is_coach_of(p_coach_id uuid, p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- Club-coach path: coach's assignment covers the athlete's club, and
    -- either the coach oversees the whole club (program_id null) or the
    -- program matches.
    select 1 from athlete_memberships am
    join coach_assignments ca on ca.club_id = am.club_id
      and (ca.program_id is null or ca.program_id = am.program_id)
    where am.athlete_id = p_athlete_id and ca.coach_id = p_coach_id
  ) or exists (
    -- Parent/guardian path: a direct link to this one athlete, no club or
    -- program required — this is what makes oversight of a minor possible
    -- even before they belong to any club.
    select 1 from guardian_links
    where guardian_links.athlete_id = p_athlete_id and guardian_links.coach_id = p_coach_id
  );
$$;

-- Identity: you can always read and write your own row in either table.
create policy "athlete reads own row" on athletes for select using (id = auth.uid());
create policy "athlete writes own row" on athletes for update using (id = auth.uid());
create policy "athlete creates own row" on athletes for insert with check (id = auth.uid());

create policy "coach reads own row" on coaches for select using (id = auth.uid());
create policy "coach writes own row" on coaches for update using (id = auth.uid());
create policy "coach creates own row" on coaches for insert with check (id = auth.uid());

-- A coach (club or parent) can see an athlete's identity row — needed for
-- the roster view and for a parent's own single-athlete view, nothing more.
create policy "coach reads linked athletes" on athletes for select using (
  is_coach_of(auth.uid(), athletes.id)
);

-- Clubs and programs: readable by anyone with a membership or assignment
-- inside them. Creating one is left permissive for now (any authenticated
-- coach can start a club) — tighten this once there's a reason to.
create policy "members read their club" on clubs for select using (
  exists (select 1 from athlete_memberships where club_id = clubs.id and athlete_id = auth.uid())
  or exists (select 1 from coach_assignments where club_id = clubs.id and coach_id = auth.uid())
);
create policy "coach creates a club" on clubs for insert with check (created_by = auth.uid());

create policy "members read their programs" on programs for select using (
  exists (select 1 from athlete_memberships where program_id = programs.id and athlete_id = auth.uid())
  or exists (
    select 1 from coach_assignments
    where club_id = programs.club_id and (program_id is null or program_id = programs.id) and coach_id = auth.uid()
  )
);

-- A guardian link is between one athlete and one coach-identity acting as
-- their parent — the athlete's own account controls who holds it, the same
-- consent model as everything else here: nothing is visible to anyone until
-- the athlete's side of the relationship grants it.
create policy "athlete manages own guardian links" on guardian_links for all using (athlete_id = auth.uid());
create policy "coach reads own guardian links" on guardian_links for select using (coach_id = auth.uid());

-- Training data: full control over your own; a linked coach (club or
-- parent) gets read-only. This is the policy shape every one of
-- workouts / click_adjustments / bouts / metal_bouts repeats.
create policy "athlete manages own workouts" on workouts for all using (athlete_id = auth.uid());
create policy "coach reads linked workouts" on workouts for select using (
  is_coach_of(auth.uid(), workouts.athlete_id)
);

create policy "athlete manages own click log" on click_adjustments for all using (
  exists (select 1 from workouts where workouts.id = click_adjustments.workout_id and workouts.athlete_id = auth.uid())
);
create policy "coach reads linked click log" on click_adjustments for select using (
  exists (
    select 1 from workouts
    where workouts.id = click_adjustments.workout_id and is_coach_of(auth.uid(), workouts.athlete_id)
  )
);

create policy "athlete manages own bouts" on bouts for all using (athlete_id = auth.uid());
create policy "coach reads linked bouts" on bouts for select using (
  is_coach_of(auth.uid(), bouts.athlete_id)
);

create policy "athlete manages own metal bouts" on metal_bouts for all using (athlete_id = auth.uid());
create policy "coach reads linked metal bouts" on metal_bouts for select using (
  is_coach_of(auth.uid(), metal_bouts.athlete_id)
);
