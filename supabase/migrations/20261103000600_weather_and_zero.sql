-- 545-coaching: the weather and the zero, each noted once per workout and editable.
--
-- The athlete notes the weather when they log the wind, and confirms the zero once its
-- adjustments are done. wind and wind_direction (already here) are the reading; these add the
-- time the wind was logged, free-text weather notes, and the time the zero was confirmed. Each
-- time is null until that has been done.

alter table workouts add column if not exists wind_logged_at timestamptz;
alter table workouts add column if not exists weather_notes text not null default '';
alter table workouts add column if not exists zero_confirmed_at timestamptz;
