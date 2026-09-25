-- 545-coaching: an admin coach can make another coach an admin, take admin
-- rights back, and remove any other coach from the club.
--
-- Two safety rules keep a club from ending up with nobody in charge:
--   * an admin can't remove themselves through remove_coach_from_club
--     (they'd use "leave"), so the caller is always a remaining admin;
--   * set_coach_admin refuses to demote the club's last admin.
-- This replaces the earlier rule that an admin couldn't be removed at all —
-- that made sense while a club only ever had one.

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

  if p_coach_id = auth.uid() then
    raise exception 'You can''t remove yourself from the club here — hand over as admin first, then leave';
  end if;

  -- Club-wide and any program-scoped assignments alike.
  delete from coach_assignments where club_id = p_club_id and coach_id = p_coach_id;
end;
$$;
grant execute on function remove_coach_from_club(uuid, uuid) to authenticated;

create or replace function set_coach_admin(p_club_id uuid, p_coach_id uuid, p_is_admin boolean)
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
    raise exception 'Only this club''s admin coach can change who is an admin';
  end if;

  if not exists (
    select 1 from coach_assignments where club_id = p_club_id and coach_id = p_coach_id
  ) then
    raise exception 'That coach isn''t part of this club';
  end if;

  if not p_is_admin and not exists (
    select 1 from coach_assignments
    where club_id = p_club_id and is_admin and coach_id <> p_coach_id
  ) then
    raise exception 'A club needs at least one admin — make someone else an admin first';
  end if;

  update coach_assignments set is_admin = p_is_admin
    where club_id = p_club_id and coach_id = p_coach_id;
end;
$$;
grant execute on function set_coach_admin(uuid, uuid, boolean) to authenticated;
