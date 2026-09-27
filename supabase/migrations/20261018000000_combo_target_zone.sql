-- 545-coaching: replaces the combos table (20261017) with a simpler design —
-- a target heart-rate zone for a combo (repeated ski-and-shoot rounds),
-- stored directly on metal_bouts rather than a separate table. combo_id
-- already ties a combo's rounds together and already acts as the flag ("is
-- this round part of a combo"), so target_zone is just another column
-- alongside it, set once when the combo starts and copied onto every round
-- added to it — a round carries its own answer without a join. This also
-- lets shooting performance be analysed against heart rate later: each round
-- already has its own heart_rate, now sitting next to the zone it was shot
-- in. 1-8, whatever the athlete's own zones mean to them — this app doesn't
-- know their bpm boundaries, so it only ever stores and shows the number,
-- never checks a round's heart rate against it.

alter table metal_bouts drop constraint metal_bouts_combo_id_fkey;
drop table combos;

alter table metal_bouts add column target_zone smallint check (target_zone between 1 and 8);
