-- 545-coaching: National Team test.
--
-- A guided range test: two 10-shot precision groups on paper (the workout's own
-- precision bouts), then 14 timed metal stages (four 4x5 "across" stages, ten 10x1
-- single shots). The precision groups are saved as ordinary bouts. This keeps the
-- rest: one row per test, tied to its workout, with the timed stages as a JSON
-- array in the order they were shot. Each stage is { kind, position, seconds, hits }.
-- The score is not stored; it is worked out from the bouts and the stages, so a
-- corrected hole or a corrected rule changes every past test at once.
--
-- Visible like the athlete's other training: the athlete manages their own, a
-- coach reads those of athletes they can view, and dev mode keeps test rows apart.

create table national_tests (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  started_at timestamptz not null,
  stages jsonb not null default '[]'::jsonb check (jsonb_typeof(stages) = 'array' and jsonb_array_length(stages) <= 14),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workout_id)
);

create index national_tests_athlete_idx on national_tests (athlete_id, started_at desc);

alter table national_tests enable row level security;

create policy "athlete manages own national tests" on national_tests for all
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());

create policy "coach reads linked national tests" on national_tests for select
  using (can_view_athlete(auth.uid(), athlete_id));

create trigger stamp_test_row before insert or update on national_tests
  for each row execute function stamp_test_row();

create policy "test data stays in dev mode" on national_tests as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or athlete_id = auth.uid()));

-- Promoting a test workout to live takes its national test with it.
create or replace function make_workout_live(p_workout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not in_dev_mode() then
    raise exception 'Only from dev mode';
  end if;
  if not exists (
    select 1 from workouts where id = p_workout_id and athlete_id = auth.uid() and is_test
  ) then
    raise exception 'That isn''t one of your test workouts';
  end if;

  -- Transaction-local, and not settable from a client request.
  perform set_config('app.allow_promote', '1', true);
  update workouts          set is_test = false where id = p_workout_id;
  update precision_bouts   set is_test = false where workout_id = p_workout_id;
  update metal_bouts       set is_test = false where workout_id = p_workout_id;
  update click_adjustments set is_test = false where workout_id = p_workout_id;
  update sensor_sessions   set is_test = false where workout_id = p_workout_id;
  update national_tests    set is_test = false where workout_id = p_workout_id;
  perform set_config('app.allow_promote', '0', true);
end;
$$;
