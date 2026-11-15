-- 545-coaching: an optional range time on a metal bout — seconds from setting up on the mat,
-- through the shooting, to leaving it. Nullable with no default: existing bouts, and any bout the
-- athlete did not time, simply have none. Tenths of a second are kept.

alter table metal_bouts add column if not exists range_seconds numeric(6, 1) check (range_seconds >= 0);
