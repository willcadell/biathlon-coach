-- 545-coaching: a workout can now be a dry-fire session instead of a range
-- session — no wind, no clicks, no bouts, just time spent and how it went.
-- Everything logged before this is, and stays, a "range" workout.

alter table workouts add column workout_type text not null default 'range'
  check (workout_type in ('range', 'dryfire'));

alter table workouts add column dryfire_minutes integer not null default 0;
