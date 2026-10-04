-- 545-coaching: sharing an achieved goal to the club feed.
--
-- A new post kind. Like every other post it's a snapshot built here, not by the
-- app, so it carries only what the database chose to put in it: the measure,
-- the target, what the athlete finished at and the end date. A goal can only be
-- posted once it has been achieved (the server checks, not just the button),
-- by its own athlete, to a club they belong to, and only once per club.

alter table feed_posts add column goal_id uuid references goals (id) on delete set null;

alter table feed_posts drop constraint feed_posts_kind_check;
alter table feed_posts add constraint feed_posts_kind_check
  check (kind in ('target', 'workout', 'announcement', 'goal'));

alter table feed_posts drop constraint feed_posts_shape_check;
alter table feed_posts add constraint feed_posts_shape_check check (
  (kind = 'target'       and bout_id is not null and workout_id is null and athlete_id is not null and coach_id is null)
  or (kind = 'workout'   and workout_id is not null and bout_id is null and athlete_id is not null and coach_id is null)
  or (kind = 'announcement' and bout_id is null and workout_id is null and athlete_id is null and coach_id is not null
      and char_length(payload->>'text') between 1 and 500)
  or (kind = 'goal' and bout_id is null and workout_id is null and athlete_id is not null and coach_id is null
      and payload ? 'metric' and payload ? 'target')
);

-- One post per goal per club; deleting the goal leaves the post (set null above),
-- since taking something off the feed is its own, separate choice.
create unique index feed_posts_goal_once on feed_posts (club_id, goal_id) where goal_id is not null;

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

  select * into v_goal from goals where id = p_goal_id and scope = 'athlete' and athlete_id = auth.uid();
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
