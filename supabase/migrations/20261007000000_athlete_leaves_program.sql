-- 545-coaching: an athlete can leave a program without leaving the club.
--
-- Leaving a club already works by deleting your own membership. Leaving just
-- the program means changing it, and athletes have no update rights on
-- athlete_memberships (they only read and delete their own), so this is a
-- function scoped strictly to the caller's own membership in that club.
--
-- The athlete stays a club member, so their feed posts and everything else
-- about their club membership are untouched; what changes is who can see
-- their training: a coach assigned only to that program no longer does, while
-- a coach overseeing the whole club (or an admin) still does.

create or replace function leave_program(p_club_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update athlete_memberships set program_id = null
    where athlete_id = auth.uid() and club_id = p_club_id;
$$;
grant execute on function leave_program(uuid) to authenticated;
