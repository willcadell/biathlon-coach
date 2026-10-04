-- 545-coaching: post_goal respects dev mode.
--
-- Goals are already stamped test or live from the request's mode, and test
-- goals are invisible outside dev mode. post_goal is security definer, so it
-- also has to refuse a goal from the other mode itself: otherwise a live
-- request naming a test goal's id could put test data on a club's real feed.

create or replace function post_goal(p_club_id uuid, p_goal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal goals%rowtype;
  v_name text;
  v_id uuid;
begin
  if not exists (
    select 1 from athlete_memberships where athlete_id = auth.uid() and club_id = p_club_id
  ) then
    raise exception 'You are not a member of that club';
  end if;

  -- A goal from the other mode is out of sight, so it's simply not found.
  select * into v_goal from goals
    where id = p_goal_id and scope = 'athlete' and athlete_id = auth.uid() and is_test = in_dev_mode();
  if not found then raise exception 'That goal isn''t yours to share'; end if;
  if v_goal.achieved_at is null then raise exception 'Only an achieved goal can be shared'; end if;
  if exists (select 1 from feed_posts where club_id = p_club_id and goal_id = p_goal_id) then
    raise exception 'You''ve already posted that goal to this club';
  end if;

  select display_name into v_name from athletes where id = auth.uid();

  insert into feed_posts (club_id, athlete_id, author_name, kind, goal_id, payload)
    values (
      p_club_id, auth.uid(), coalesce(v_name, ''), 'goal', p_goal_id,
      jsonb_build_object(
        'metric', v_goal.metric,
        'position', v_goal.position,
        'target', v_goal.target,
        'achievedValue', v_goal.achieved_value,
        'endsOn', v_goal.ends_on,
        'achievedAt', v_goal.achieved_at
      )
    )
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function post_goal(uuid, uuid) from public, anon;
grant execute on function post_goal(uuid, uuid) to authenticated;
