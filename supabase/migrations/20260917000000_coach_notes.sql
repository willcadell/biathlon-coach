-- 545-coaching: a coach can leave notes on an athlete's workout — the one
-- write a "read-only" coach view is allowed, since feedback is the point of
-- coaching. coach_name is captured at write time so the athlete's own view
-- never needs a join back through coaches (which the athlete has no read
-- access to anyway) just to show who left it.

create table workout_coach_notes (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  coach_id uuid not null references coaches (id) on delete cascade,
  coach_name text not null,
  created_at timestamptz not null default now(),
  note text not null
);
alter table workout_coach_notes enable row level security;

-- The athlete reads notes left on their own workouts, but never writes one —
-- this table inverts the read/write split every other training table uses.
create policy "athlete reads coach notes on own workouts" on workout_coach_notes for select using (
  exists (
    select 1 from workouts
    where workouts.id = workout_coach_notes.workout_id and workouts.athlete_id = auth.uid()
  )
);

-- Any coach linked to the athlete reads the whole log, not just their own
-- notes — a shared log across co-coaches is the point, the same as the
-- roster itself.
create policy "coach reads notes on linked workouts" on workout_coach_notes for select using (
  exists (
    select 1 from workouts
    where workouts.id = workout_coach_notes.workout_id and is_coach_of(auth.uid(), workouts.athlete_id)
  )
);

create policy "coach adds notes on linked workouts" on workout_coach_notes for insert with check (
  coach_id = auth.uid() and exists (
    select 1 from workouts
    where workouts.id = workout_coach_notes.workout_id and is_coach_of(auth.uid(), workouts.athlete_id)
  )
);

create policy "coach deletes own notes" on workout_coach_notes for delete using (coach_id = auth.uid());
