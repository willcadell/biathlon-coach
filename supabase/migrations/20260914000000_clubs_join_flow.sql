-- 545-coaching: Stage 2 — clubs, join codes, and roster access.
--
-- The identity and membership tables have existed since Stage 0, but
-- nothing could actually use them yet: athlete_memberships and
-- coach_assignments had RLS enabled with zero policies, which means every
-- row on both was invisible and unwritable to everyone. This migration is
-- what turns "the tables exist" into "an athlete can join a club."

-- A short code an athlete types in to join, rather than needing to be
-- invited by email — there's no server here to send mail from, and this
-- keeps the whole flow client-and-database. Not exposed through a normal
-- SELECT policy (see find_club_by_join_code below): knowing the code is
-- what grants access, the same way a real invite code works, not
-- membership in some group that could already read the clubs table.
alter table clubs add column join_code text unique;

-- Resolves a join code to the club it belongs to, and nothing else about
-- the clubs table. Security definer so it can check the code against
-- every club's row regardless of what the caller could otherwise SELECT —
-- the code itself is the credential, not the caller's existing access.
create or replace function find_club_by_join_code(p_code text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select clubs.id, clubs.name from clubs where clubs.join_code = p_code;
$$;
grant execute on function find_club_by_join_code(text) to authenticated;

-- An athlete manages their own memberships (this is the join/leave action);
-- a coach reads the membership rows that fall inside their own assignment,
-- which is exactly what a roster query needs and exactly what is_coach_of
-- already tests for one athlete at a time.
create policy "athlete manages own memberships" on athlete_memberships for all using (athlete_id = auth.uid());
create policy "coach reads memberships in scope" on athlete_memberships for select using (
  is_coach_of(auth.uid(), athlete_memberships.athlete_id)
);

-- A coach manages their own assignments (this is how "I coach this club"
-- gets recorded, including by whoever just created the club below).
create policy "coach manages own assignments" on coach_assignments for all using (coach_id = auth.uid());
