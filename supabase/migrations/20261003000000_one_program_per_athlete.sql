-- 545-coaching: an athlete is in one program at a time (for now).
--
-- The join and assign functions already move a membership rather than adding
-- a second one, but nothing at the table level stopped it: the old index was
-- unique on (athlete, club, program), so an athlete could hold a club-level
-- row plus a row per program. This is unique on (athlete, club) — one
-- membership row per club, which carries the program or none.
--
-- Scoped to a club, not global: an athlete in two clubs still has one
-- membership in each. Widening to several programs later means relaxing this
-- one index, since every function that writes memberships already treats the
-- row as "the" membership.

drop index athlete_memberships_one_per_club;
create unique index athlete_memberships_one_per_club
  on athlete_memberships (athlete_id, club_id);
