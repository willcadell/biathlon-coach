-- 545-coaching: narrow a combo's target heart-rate zone to 1-5.
--
-- Matches the standard five-zone training model, and the "Start a combo"
-- dialog now offers exactly these five as coloured buttons (grey, blue,
-- green, orange, red). No existing data holds a zone above 5, so this is a
-- plain tightening, not a migration of real values.

alter table metal_bouts drop constraint metal_bouts_target_zone_check;
alter table metal_bouts add constraint metal_bouts_target_zone_check check (target_zone between 1 and 5);
