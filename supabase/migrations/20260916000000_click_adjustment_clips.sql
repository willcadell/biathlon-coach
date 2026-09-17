-- 545-coaching: record how many clips (magazines) were fired to confirm a
-- click adjustment settled, alongside the adjustment itself.

alter table click_adjustments add column clips smallint not null default 0;
