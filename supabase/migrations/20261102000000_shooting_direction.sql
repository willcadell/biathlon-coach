-- 545-coaching: the order an athlete shoots the five metal discs.
--
-- Athletes shoot the discs either alpha to echo or echo to alpha (alpha is the
-- leftmost, echo the rightmost, looking downrange). The app records which discs
-- fell but not the order they were fired in, so advice about the first or last
-- shots of a bout (arrival, rushing, fatigue) needs this to know which discs
-- those were.
--
-- It lives on the athlete's row, not in the browser, so it is the same on every
-- device and a coach reading the athlete's bouts sees the same order. The
-- athlete already reads and updates their own row, and a coach already reads
-- the rows of the athletes they coach; no policy changes are needed.

alter table athletes
  add column shooting_direction text not null default 'alpha_to_echo'
  check (shooting_direction in ('alpha_to_echo', 'echo_to_alpha'));
