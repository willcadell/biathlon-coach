-- 545-coaching: sensor sessions.
--
-- A dry-fire session can be shot with the optical sensor trainer (SCATT receiver,
-- five targets Alpha to Echo, scored hit or miss). Until now a finished session
-- only added its minutes and one line to the workout's notes, and the shots, the
-- route of the rifle to each shot and the replay were lost when it was closed.
-- This keeps them, so History can show a session again and Analysis can read it.
--
-- One row per finished sensor session in a dry-fire workout. The shots are a JSON
-- array on the row, not rows of their own: they are only ever read with their
-- session, and a session is a handful of shots with a small route each. Each shot
-- carries where it landed (mm at the 5 m scale of the dry-fire target, origin at
-- Charlie), whether it hit, the nearest target (0 Alpha to 4 Echo), the time of the
-- shot, the simplified route from the previous shot, and how steady the aim was in
-- the second before the pull. No raw aim trace is stored.
--
-- Visible like the athlete's other training: the athlete reads and manages their
-- own, a coach reads those of athletes they can view (a club coach, a personal
-- coach, or a platform admin who has acknowledged the responsibilities), and dev
-- mode keeps test sessions apart exactly as it does for bouts.

create table sensor_sessions (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  started_at timestamptz not null,
  position text not null check (position in ('prone', 'standing')),
  minutes int not null default 0 check (minutes >= 0),
  shots jsonb not null default '[]'::jsonb check (jsonb_typeof(shots) = 'array' and jsonb_array_length(shots) <= 2000),
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create index sensor_sessions_athlete_idx on sensor_sessions (athlete_id, started_at desc);
create index sensor_sessions_workout_idx on sensor_sessions (workout_id);

alter table sensor_sessions enable row level security;

create policy "athlete manages own sensor sessions" on sensor_sessions for all
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());

create policy "coach reads linked sensor sessions" on sensor_sessions for select
  using (can_view_athlete(auth.uid(), athlete_id));

-- Dev mode: the request's mode decides the tag, and test rows stay with their maker.
create trigger stamp_test_row before insert or update on sensor_sessions
  for each row execute function stamp_test_row();

create policy "test data stays in dev mode" on sensor_sessions as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or athlete_id = auth.uid()));

-- Promoting a test workout to live takes its sensor sessions with it.
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
  perform set_config('app.allow_promote', '0', true);
end;
$$;
