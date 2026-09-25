-- Fixes remove_cowbells_on_leave from the previous migration, which read both
-- old.athlete_id and old.coach_id. Postgres resolves every field reference in
-- the function when it's first planned, so the branch not taken still failed:
-- the trigger errored on BOTH tables, blocking every athlete leaving a club
-- and every coach being removed. to_jsonb(old) reads whichever field the
-- table actually has.

create or replace function remove_cowbells_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce((to_jsonb(old)->>'athlete_id')::uuid, (to_jsonb(old)->>'coach_id')::uuid);
  v_club uuid := old.club_id;
begin
  if not is_club_member(v_user, v_club) then
    delete from feed_cowbells c using feed_posts p
      where c.post_id = p.id and p.club_id = v_club and c.user_id = v_user;
  end if;
  return old;
end;
$$;
