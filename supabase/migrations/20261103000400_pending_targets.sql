-- 545-coaching: precision bouts shot before their target is collected.
--
-- The range is open while anyone is shooting, which is unsafe, and closed when
-- shooting has stopped, which is safe. Nobody goes downrange for a paper target
-- until the range is closed again, so a precision bout happens first and its
-- target is photographed afterwards. This holds a bout that has happened but has no
-- photo yet: its position and when it was shot, in the workout it belongs to.
--
-- When the target is photographed it becomes an ordinary precision bout with the
-- same id and shot time, and the row here is removed. The id is therefore stable
-- from the moment of shooting, which is what lets a National Team test point at its
-- two groups before either has a photo.
--
-- The athlete's own, and not shown to coaches: until it has a photo there is
-- nothing to read. Dev mode keeps test rows apart as it does for bouts.

create table pending_targets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  shot_at timestamptz not null,
  position text not null check (position in ('prone', 'standing')),
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create index pending_targets_workout_idx on pending_targets (workout_id);

alter table pending_targets enable row level security;

create policy "athlete manages own pending targets" on pending_targets for all
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());

create trigger stamp_test_row before insert or update on pending_targets
  for each row execute function stamp_test_row();

create policy "test data stays in dev mode" on pending_targets as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or athlete_id = auth.uid()));

-- A National Team test names its two groups from the moment each is shot, when the
-- id is still a pending target and not yet a bout, so these can no longer be
-- foreign keys to precision_bouts. A group whose bout is later deleted just reads
-- as not photographed.
alter table national_tests
  drop constraint if exists national_tests_prone_bout_id_fkey,
  drop constraint if exists national_tests_standing_bout_id_fkey;

-- Promoting a test workout to live takes its pending targets with it.
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
  update pending_targets   set is_test = false where workout_id = p_workout_id;
  perform set_config('app.allow_promote', '0', true);
end;
$$;
