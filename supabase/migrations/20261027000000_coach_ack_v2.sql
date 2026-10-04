-- 545-coaching: coach responsibilities, version 2.
--
-- The agreement now has the coach confirm they have taken the Responsible
-- Coaching Movement's RCM Pledge, so everyone who agreed to version 1 agrees
-- again. Their old acknowledgement stays on record but no longer counts
-- (coach_has_acknowledged compares against this version).

create or replace function required_coach_ack_version()
returns int
language sql
immutable
as $$ select 2 $$;
