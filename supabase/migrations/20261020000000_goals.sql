-- 545-coaching: goals.
--
-- A goal is a target for one measure, over a window the owner picks. Athlete
-- goals come first; scope, program_id and club_id are here now so program and
-- club goals can follow without reshaping the table, but only athlete-scope
-- rows can be created today (no policy admits the others).
--
-- Progress is never stored: it's computed from the training the app already
-- holds (metal bouts, precision bouts, dry-fire minutes) between starts_on and
-- ends_on. What is stored is the moment a goal was first met, so a goal that
-- was achieved stays achieved and can be shared.
--
-- Private to the athlete unless they share it, and then visible only to the
-- coaches who already see their training (is_coach_of).

create table goals (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'athlete' check (scope in ('athlete', 'program', 'club')),
  athlete_id uuid references athletes (id) on delete cascade,
  program_id uuid references programs (id) on delete cascade,
  club_id uuid references clubs (id) on delete cascade,
  metric text not null check (metric in ('metal_hit_rate', 'precision_score', 'dryfire_minutes')),
  -- Which position a rate or score is for; null means both. Meaningless for dry-fire.
  position text check (position in ('prone', 'standing')),
  target numeric not null check (target > 0),
  starts_on date not null default current_date,
  ends_on date not null,
  shared boolean not null default false,
  achieved_at timestamptz,
  achieved_value numeric,
  created_at timestamptz not null default now(),
  is_test boolean not null default false,
  check (ends_on >= starts_on),
  check (metric = 'dryfire_minutes' or target <= 100),
  check (metric <> 'dryfire_minutes' or position is null),
  check (
    (scope = 'athlete' and athlete_id is not null and program_id is null and club_id is null)
    or (scope = 'program' and program_id is not null and athlete_id is null and club_id is null)
    or (scope = 'club' and club_id is not null and athlete_id is null and program_id is null)
  )
);
create index goals_athlete on goals (athlete_id, ends_on);

alter table goals enable row level security;

create policy "athlete manages own goals" on goals for all
  using (scope = 'athlete' and athlete_id = auth.uid())
  with check (scope = 'athlete' and athlete_id = auth.uid());

create policy "coaches read goals the athlete shared" on goals for select
  using (scope = 'athlete' and shared and is_coach_of(auth.uid(), athlete_id));

-- Dev mode, same as every other table an athlete's training lives in: stamped
-- from the request's mode, and test goals only visible in dev mode, to their owner.
create trigger stamp_test_row before insert or update on goals
  for each row execute function stamp_test_row();

create policy "test data stays in dev mode" on goals as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or athlete_id = auth.uid()));
