-- 545-coaching: a National Team test inside a range session.
--
-- The test now lives in an ordinary range workout, which can hold other precision
-- bouts as well, so the test has to say which two of them are its prone and standing
-- groups. A group's photo and shots stay in precision_bouts; deleting that bout
-- just empties the slot, and the test asks for the group again.

alter table national_tests
  add column prone_bout_id uuid references precision_bouts (id) on delete set null,
  add column standing_bout_id uuid references precision_bouts (id) on delete set null;
