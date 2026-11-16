-- 545-coaching: how a session felt, and what the athlete noticed on a bout.
--
-- workouts.checkin: three one-tap ratings asked when a session is finished, each
-- 1 (good) to 3 (rough), any of them skipped: {"energy": 1-3, "head": 1-3, "hold": 1-3}.
-- Null when the athlete skipped it, or for sessions from before it existed.
--
-- precision_bouts.tags and metal_bouts.tags: what the athlete noticed on that bout
-- ("rushed", "wind", ...), from a fixed list kept in the app (src/lib/sessionFeel.ts),
-- so the list can grow without a migration. Empty when nothing was tagged.
--
-- The existing row-level security on each table covers the new columns: the athlete
-- writes their own, linked coaches read them. See docs/athlete-feedback/DESIGN.md.

alter table workouts add column checkin jsonb;
alter table precision_bouts add column tags text[] not null default '{}';
alter table metal_bouts add column tags text[] not null default '{}';
