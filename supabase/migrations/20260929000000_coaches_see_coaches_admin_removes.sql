-- 545-coaching: every coach at a club can see every coach at that club, and
-- only the club's admin can remove one.
--
-- The visibility half was already intended ("coach reads co-coaches in same
-- club" on coach_assignments) but only got as far as the assignment rows: the
-- coaches table itself only had "coach reads own row", so coachesForClub
-- could list who else was assigned yet never read their names — every coach
-- saw a Coaches list containing only themselves.

-- security definer for the same reason as shares_club_with: the check reads
-- coach_assignments, and doing that from a policy would re-apply that
-- table's own policies.
create or replace function coach_shares_club_with_coach(p_viewer_id uuid, p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from coach_assignments viewer
    join coach_assignments other on other.club_id = viewer.club_id
    where viewer.coach_id = p_viewer_id and other.coach_id = p_coach_id
  );
$$;

create policy "coach reads co-coaches" on coaches for select using (
  coach_shares_club_with_coach(auth.uid(), coaches.id)
);

-- Only the club's admin removes another coach. Not a policy on
-- coach_assignments because "coach leaves own assignments" is the only
-- delete rule there and the admin check needs to be explicit. The admin
-- can't be removed this way — that would leave the club with nobody able to
-- rename it, invite coaches, or remove anyone.
create or replace function remove_coach_from_club(p_club_id uuid, p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from coach_assignments
    where club_id = p_club_id and coach_id = auth.uid() and is_admin
  ) then
    raise exception 'Only this club''s admin coach can remove a coach';
  end if;

  if exists (
    select 1 from coach_assignments
    where club_id = p_club_id and coach_id = p_coach_id and is_admin
  ) then
    raise exception 'The club''s admin coach can''t be removed';
  end if;

  -- Club-wide and any program-scoped assignments alike.
  delete from coach_assignments where club_id = p_club_id and coach_id = p_coach_id;
end;
$$;
grant execute on function remove_coach_from_club(uuid, uuid) to authenticated;
