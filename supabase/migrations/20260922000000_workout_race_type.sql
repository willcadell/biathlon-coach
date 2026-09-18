-- 545-coaching: move the race flag from a per-metal-bout toggle to the
-- workout as a whole, and record which of the four IBU formats it was.
--
-- A race is a property of the session, not of one bout within it — the
-- previous per-bout flag could end up half-set across a combo. This
-- replaces it outright rather than keeping both as parallel sources of truth.

alter table metal_bouts drop column if exists is_race;

alter table workouts add column if not exists race_type text
  check (race_type in ('sprint', 'individual', 'mass-start', 'pursuit'));
