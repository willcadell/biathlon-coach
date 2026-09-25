-- 545-coaching: a coach can delete a program, and take an athlete out of one.
--
-- Not admin-only, matching "club coach creates a program": any coach who
-- oversees the whole club, or is scoped to that program, can do either.
--
-- These are functions rather than policies because the obvious version is
-- destructive: athlete_memberships.program_id is ON DELETE CASCADE, so a
-- plain `delete from programs` would delete every athlete's membership in it
-- — removing them from the club altogether, not just from the program.
-- Both functions move the membership back to "in the club, no program"
-- instead. (coach_assignments.program_id also cascades, which is right: a
-- coach scoped only to a program that no longer exists has nothing left to
-- oversee.)

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
      and (ca.program_id is null or ca.program_id = programs.id)
  );
$$;

-- Moves one athlete's membership out of a program back to the club level.
-- If they somehow already have a club-level row (the unique index allows one
-- per program plus one with none), the program row is dropped instead of
-- becoming a duplicate.
create or replace function remove_athlete_from_program(p_athlete_id uuid, p_program_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  if not coach_can_manage_program(p_program_id) then
    raise exception 'You do not coach this program';
  end if;

  select programs.club_id into v_club_id from programs where programs.id = p_program_id;

  if exists (
    select 1 from athlete_memberships
    where athlete_id = p_athlete_id and club_id = v_club_id and program_id is null
  ) then
    delete from athlete_memberships
      where athlete_id = p_athlete_id and program_id = p_program_id;
  else
    update athlete_memberships set program_id = null
      where athlete_id = p_athlete_id and program_id = p_program_id;
  end if;
end;
$$;
grant execute on function remove_athlete_from_program(uuid, uuid) to authenticated;

create or replace function delete_program(p_program_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  if not coach_can_manage_program(p_program_id) then
    raise exception 'You do not coach this program';
  end if;

  select programs.club_id into v_club_id from programs where programs.id = p_program_id;

  -- Athletes who already have a club-level row just lose the program row;
  -- everyone else moves to club level. Both before the program goes, or the
  -- cascade would take the memberships with it.
  delete from athlete_memberships am
    where am.program_id = p_program_id
      and exists (
        select 1 from athlete_memberships other
        where other.athlete_id = am.athlete_id and other.club_id = v_club_id and other.program_id is null
      );
  update athlete_memberships set program_id = null where program_id = p_program_id;

  delete from programs where id = p_program_id;
end;
$$;
grant execute on function delete_program(uuid) to authenticated;
