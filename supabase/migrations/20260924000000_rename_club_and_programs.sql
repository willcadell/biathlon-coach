-- 545-coaching: club admins can rename their club, and any coach on a club
-- can add a program to it. The "coach settings" screen never made sense
-- while coaching (it was all athlete calibration fields) — this is what
-- replaces it, inside the Coach tab's own club page instead.

-- Mirrors create_club's friendly-uniqueness pattern rather than leaning on
-- the clubs.for-update policy directly, so a duplicate name fails with a
-- clear reason instead of a raw constraint-violation error.
create or replace function rename_club(p_club_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from coach_assignments
    where coach_assignments.club_id = p_club_id
      and coach_assignments.coach_id = auth.uid()
      and coach_assignments.is_admin
  ) then
    raise exception 'Only this club''s admin coach can rename it';
  end if;

  if exists (
    select 1 from clubs
    where lower(trim(clubs.name)) = lower(trim(p_name)) and clubs.id <> p_club_id
  ) then
    raise exception 'A club named "%" already exists — pick a different name.', p_name;
  end if;

  update clubs set name = trim(p_name) where id = p_club_id;
end;
$$;
grant execute on function rename_club(uuid, text) to authenticated;

-- Any coach assigned to the club — not just its admin — can add a program.
create policy "club coach creates a program" on programs for insert with check (
  exists (
    select 1 from coach_assignments
    where coach_assignments.club_id = programs.club_id
      and coach_assignments.coach_id = auth.uid()
  )
);
