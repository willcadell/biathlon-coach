-- 545-coaching: how a bout's shot_at came to be.
--
-- Bout times will be matched against heart-rate streams from Garmin or Strava, and the match
-- is fuzzy, so it helps to know how much to trust each time:
--   'live'    stamped as it happened: when the bout was opened, or when the athlete said "shot".
--   'entered' set by hand afterwards.
--   null      saved before this was recorded; the time is when the bout was saved.
-- Nullable with no default, so existing rows read as "unknown" rather than claiming to be live.

alter table metal_bouts add column if not exists time_source text check (time_source in ('live', 'entered'));
alter table precision_bouts add column if not exists time_source text check (time_source in ('live', 'entered'));
