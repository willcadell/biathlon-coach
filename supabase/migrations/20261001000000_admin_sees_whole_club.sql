-- 545-coaching: an admin coach sees every athlete in every program of their
-- club, whatever their own assignment happens to be scoped to.
--
-- Visibility followed the assignment row: program_id null meant the whole
-- club, a program id meant only that program. That was fine while admins were
-- always the coach who created the club (a whole-club row), but an admin can
-- now be made from any coach — including one scoped to a single program —
-- and flipping is_admin on that row left them seeing just their own program.
--
-- Admin status now widens the scope itself, in the three places scope is
-- decided. Demoting someone narrows it straight back with no leftover access,
-- which is why this checks is_admin rather than rewriting their assignment
-- to be club-wide.

create or replace function is_coach_of(p_coach_id uuid, p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- Club-coach path: the coach oversees the whole club (program_id null),
    -- is an admin of it, or their program matches the athlete's.
    select 1 from athlete_memberships am
    join coach_assignments ca on ca.club_id = am.club_id
      and (ca.program_id is null or ca.is_admin or ca.program_id = am.program_id)
    where am.athlete_id = p_athlete_id and ca.coach_id = p_coach_id
  ) or exists (
    -- Parent/guardian path: unchanged.
    select 1 from guardian_links
    where guardian_links.athlete_id = p_athlete_id and guardian_links.coach_id = p_coach_id
  );
$$;

drop policy "members read their programs" on programs;
create policy "members read their programs" on programs for select using (
  exists (select 1 from athlete_memberships where program_id = programs.id and athlete_id = auth.uid())
  or exists (
    select 1 from coach_assignments
    where club_id = programs.club_id
      and (program_id is null or is_admin or program_id = programs.id)
      and coach_id = auth.uid()
  )
);

create or replace function coach_can_manage_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from programs
    join coach_assignments ca on ca.club_id = programs.club_id
    where programs.id = p_program_id
      and ca.coach_id = auth.uid()
      and (ca.program_id is null or ca.is_admin or ca.program_id = programs.id)
  );
$$;
