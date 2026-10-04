-- 545-coaching: archive a finished goal, and remember it's been celebrated.
--
-- archived_at: the athlete tidying a finished goal off their home. It isn't
-- deleted — "All goals" still shows it, and it can be brought back.
-- celebrated_at: when the athlete was first shown the confetti and success
-- message for achieving it, so that happens once per goal rather than every
-- time they open the app.
--
-- The existing "athlete manages own goals" policy already covers updating both.

alter table goals
  add column archived_at timestamptz,
  add column celebrated_at timestamptz;

-- Goals met before this existed have already been seen; don't celebrate them
-- retroactively.
update goals set celebrated_at = now() where achieved_at is not null;
