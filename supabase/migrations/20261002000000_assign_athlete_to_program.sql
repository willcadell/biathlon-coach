-- 545-coaching: a coach can put an unassigned club athlete into a program.
--
-- Same permission as delete_program / remove_athlete_from_program: any coach
-- who oversees the whole club, is an admin, or is scoped to that program.
-- Only moves an athlete who's already in this program's club without a
-- program — it doesn't pull someone into a club they haven't joined (the
-- athlete's own join, with its consent step, stays the only way in), and it
-- doesn't quietly reassign someone already in a different program.

create or replace function assign_athlete_to_program(p_athlete_id uuid, p_program_id uuid)
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

  update athlete_memberships set program_id = p_program_id
    where athlete_id = p_athlete_id and club_id = v_club_id and program_id is null;

  if not found then
    raise exception 'That athlete isn''t an unassigned member of this club';
  end if;
end;
$$;
grant execute on function assign_athlete_to_program(uuid, uuid) to authenticated;
