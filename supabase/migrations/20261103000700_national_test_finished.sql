-- 545-coaching: a National Team test finished early, with a partial score.
--
-- A test normally ends when every part is shot and both targets photographed. The athlete can
-- also finish it early, with what has been shot; the score then covers only those parts and is
-- shown as partial. finished_at is when they chose to finish, null while the test is open.

alter table national_tests add column if not exists finished_at timestamptz;
