-- 545-coaching: sharing a combo, a metal session or a race result to the club feed.
--
-- Two new post kinds, built here like every other post, so the feed carries only what the
-- database chose to put in it:
--   'combo'  one combo's rounds (a combo is the metal bouts sharing a combo_id).
--   'metal'  a whole session's metal bouts; for a race workout this is the race result.
-- A post holds each bout's position, its five hit/miss flags, its range time and when it was shot.
-- Not shared, as with every other post: heart rate, notes, coach notes, the zero log, photos.
--
-- Posted by the workout's own athlete, to a club they belong to, once per club (per combo for a
-- combo, per workout for a session). A post belongs to its workout, so deleting the workout takes it
-- off the feed; deleting only a combo's rounds leaves it, as taking a post down is its own choice.

alter table feed_posts add column combo_id uuid;

alter table feed_posts drop constraint feed_posts_kind_check;
alter table feed_posts add constraint feed_posts_kind_check
  check (kind in ('target', 'workout', 'announcement', 'goal', 'combo', 'metal'));

alter table feed_posts drop constraint feed_posts_shape_check;
alter table feed_posts add constraint feed_posts_shape_check check (
  (kind = 'target'       and bout_id is not null and workout_id is null and athlete_id is not null and coach_id is null)
  or (kind = 'workout'   and workout_id is not null and bout_id is null and athlete_id is not null and coach_id is null)
  or (kind = 'announcement' and bout_id is null and workout_id is null and athlete_id is null and coach_id is not null
      and char_length(payload->>'text') between 1 and 500)
  or (kind = 'goal' and bout_id is null and workout_id is null and athlete_id is not null and coach_id is null
      and payload ? 'metric' and payload ? 'target')
  or (kind = 'combo' and combo_id is not null and workout_id is not null and bout_id is null
      and athlete_id is not null and coach_id is null
      and case when jsonb_typeof(payload->'bouts') = 'array' then jsonb_array_length(payload->'bouts') between 1 and 200 else false end)
  or (kind = 'metal' and combo_id is null and workout_id is not null and bout_id is null
      and athlete_id is not null and coach_id is null
      and case when jsonb_typeof(payload->'bouts') = 'array' then jsonb_array_length(payload->'bouts') between 1 and 200 else false end)
);

-- A workout can now have a metal post as well as a workout post, so "one per workout" is per kind.
drop index feed_posts_one_per_workout;
create unique index feed_posts_one_per_workout on feed_posts (club_id, workout_id) where kind = 'workout';
create unique index feed_posts_one_metal_per_workout on feed_posts (club_id, workout_id) where kind = 'metal';
create unique index feed_posts_one_per_combo on feed_posts (club_id, combo_id) where combo_id is not null;

-- post_to_feed looked a workout's post up by workout alone; with other kinds on the same workout it
-- must look only at its own kind. Otherwise it would hand back a metal post's id.
create or replace function post_to_feed(p_club_id uuid, p_bout_id uuid default null, p_workout_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_id uuid;
  v_bout precision_bouts%rowtype;
  v_workout workouts%rowtype;
  v_payload jsonb;
begin
  if (p_bout_id is null) = (p_workout_id is null) then
    raise exception 'Post either a target or a workout';
  end if;

  if not exists (
    select 1 from athlete_memberships where athlete_id = auth.uid() and club_id = p_club_id
  ) then
    raise exception 'You are not a member of that club';
  end if;

  select display_name into v_name from athletes where id = auth.uid();

  if p_bout_id is not null then
    select * into v_bout from precision_bouts where id = p_bout_id and athlete_id = auth.uid();
    if not found then raise exception 'That target isn''t yours to share'; end if;
    select * into v_workout from workouts where id = v_bout.workout_id;

    v_payload := jsonb_build_object(
      'position', v_bout.position,
      'targetFaceId', v_bout.target_face_id,
      'bulletDiameterMm', v_bout.bullet_diameter_mm,
      'shots', v_bout.shots,
      'metrics', v_bout.metrics,
      'shotAt', v_bout.shot_at,
      'workoutName', v_workout.name
    );

    select id into v_id from feed_posts where club_id = p_club_id and bout_id = p_bout_id;
    if v_id is null then
      insert into feed_posts (club_id, athlete_id, author_name, kind, bout_id, payload)
        values (p_club_id, auth.uid(), coalesce(v_name, ''), 'target', p_bout_id, v_payload)
        returning id into v_id;
    end if;
    return v_id;
  end if;

  select * into v_workout from workouts where id = p_workout_id and athlete_id = auth.uid();
  if not found then raise exception 'That workout isn''t yours to share'; end if;

  v_payload := jsonb_build_object(
    'name', v_workout.name,
    'startedAt', v_workout.started_at,
    'workoutType', v_workout.workout_type,
    'raceType', v_workout.race_type,
    'dryfireMinutes', v_workout.dryfire_minutes,
    'precisionBouts', (select count(*) from precision_bouts where workout_id = p_workout_id),
    'metalBouts', (select count(*) from metal_bouts where workout_id = p_workout_id),
    'metalShots', (select count(*) * 5 from metal_bouts where workout_id = p_workout_id),
    'metalHits', (
      select coalesce(sum(hit_alpha::int + hit_beta::int + hit_charlie::int + hit_delta::int + hit_echo::int), 0)
      from metal_bouts where workout_id = p_workout_id
    ),
    'stages', case when v_workout.race_type is null then null else (
      select coalesce(jsonb_agg(jsonb_build_object(
               'position', position,
               'hits', hit_alpha::int + hit_beta::int + hit_charlie::int + hit_delta::int + hit_echo::int
             ) order by shot_at), '[]'::jsonb)
      from metal_bouts where workout_id = p_workout_id
    ) end,
    'best', (
      select jsonb_build_object('ringTotal', (metrics->>'ringTotal')::numeric, 'ringPossible', (metrics->>'ringPossible')::numeric)
      from precision_bouts
      where workout_id = p_workout_id and coalesce((metrics->>'ringPossible')::numeric, 0) > 0
      order by (metrics->>'ringTotal')::numeric / (metrics->>'ringPossible')::numeric desc
      limit 1
    )
  );

  select id into v_id from feed_posts where club_id = p_club_id and workout_id = p_workout_id and kind = 'workout';
  if v_id is null then
    insert into feed_posts (club_id, athlete_id, author_name, kind, workout_id, payload)
      values (p_club_id, auth.uid(), coalesce(v_name, ''), 'workout', p_workout_id, v_payload)
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function post_metal_to_feed(p_club_id uuid, p_workout_id uuid, p_combo_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_id uuid;
  v_workout workouts%rowtype;
  v_bouts jsonb;
  v_zone smallint;
begin
  if not exists (
    select 1 from athlete_memberships where athlete_id = auth.uid() and club_id = p_club_id
  ) then
    raise exception 'You are not a member of that club';
  end if;

  -- A workout from the other mode is out of sight, so it is simply not found (see post_goal).
  select * into v_workout from workouts
    where id = p_workout_id and athlete_id = auth.uid() and is_test = in_dev_mode();
  if not found then raise exception 'That workout isn''t yours to share'; end if;

  select jsonb_agg(jsonb_build_object(
           'position', position,
           'hits', jsonb_build_array(hit_alpha, hit_beta, hit_charlie, hit_delta, hit_echo),
           'rangeSeconds', range_seconds,
           'shotAt', shot_at
         ) order by shot_at)
    into v_bouts
    from metal_bouts
    where workout_id = p_workout_id and athlete_id = auth.uid()
      and (p_combo_id is null or combo_id = p_combo_id);
  if v_bouts is null then raise exception 'There is nothing to share'; end if;
  if jsonb_array_length(v_bouts) > 200 then raise exception 'That is too many bouts to post'; end if;

  select display_name into v_name from athletes where id = auth.uid();

  if p_combo_id is null then
    select id into v_id from feed_posts where club_id = p_club_id and workout_id = p_workout_id and kind = 'metal';
    if v_id is null then
      insert into feed_posts (club_id, athlete_id, author_name, kind, workout_id, payload)
        values (
          p_club_id, auth.uid(), coalesce(v_name, ''), 'metal', p_workout_id,
          jsonb_build_object(
            'name', v_workout.name, 'startedAt', v_workout.started_at,
            'raceType', v_workout.race_type, 'zone', null, 'bouts', v_bouts
          )
        )
        returning id into v_id;
    end if;
    return v_id;
  end if;

  select id into v_id from feed_posts where club_id = p_club_id and combo_id = p_combo_id;
  if v_id is null then
    select target_zone into v_zone from metal_bouts
      where workout_id = p_workout_id and combo_id = p_combo_id and athlete_id = auth.uid()
      order by shot_at limit 1;
    insert into feed_posts (club_id, athlete_id, author_name, kind, workout_id, combo_id, payload)
      values (
        p_club_id, auth.uid(), coalesce(v_name, ''), 'combo', p_workout_id, p_combo_id,
        jsonb_build_object(
          'name', v_workout.name, 'startedAt', v_workout.started_at,
          'raceType', null, 'zone', v_zone, 'bouts', v_bouts
        )
      )
      returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function post_metal_to_feed(uuid, uuid, uuid) from public, anon;
grant execute on function post_metal_to_feed(uuid, uuid, uuid) to authenticated;
