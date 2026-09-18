-- 545-coaching: flag a metal bout (or a whole combo of them) as a race.
--
-- Lets race hit rate be read apart from training instead of blending into
-- one average — the number that actually decides a result versus practice.

alter table metal_bouts add column if not exists is_race boolean not null default false;
