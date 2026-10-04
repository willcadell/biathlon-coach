-- 545-coaching: which coaches can see this athlete, per club.
--
-- Athletes agree to share their training with "its coaches" when they join, but
-- the coaches table only shows an athlete their personal coaches. This lets an
-- athlete see the club coaches who can actually see them: the same rule as
-- is_coach_of (a whole-club coach, an admin, or a coach for the athlete's own
-- program). Names only, plus whether they're an admin; nothing else about them.

create or replace function my_club_coaches()
returns table (club_id uuid, coach_id uuid, coach_name text, is_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select am.club_id, c.id, c.display_name, bool_or(ca.is_admin)
  from athlete_memberships am
  join coach_assignments ca on ca.club_id = am.club_id
    and (ca.program_id is null or ca.is_admin or ca.program_id = am.program_id)
  join coaches c on c.id = ca.coach_id
  where am.athlete_id = auth.uid()
  group by am.club_id, c.id, c.display_name
  order by c.display_name;
$$;

revoke execute on function my_club_coaches() from public, anon;
grant execute on function my_club_coaches() to authenticated;
