-- 545-coaching: a workout post now carries metal results, and a race post
-- carries its stages, so a race reads as a race in the feed rather than "2
-- metal bouts".
--
-- Added to the snapshot: total metal hits and shots, and — for a race only —
-- each stage in shot order with its position and hit count (0-5). Still not
-- shared: heart rate, notes, coach notes, the zero log, photos. Existing posts
-- keep the smaller snapshot they were made with.

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

  select id into v_id from feed_posts where club_id = p_club_id and workout_id = p_workout_id;
  if v_id is null then
    insert into feed_posts (club_id, athlete_id, author_name, kind, workout_id, payload)
      values (p_club_id, auth.uid(), coalesce(v_name, ''), 'workout', p_workout_id, v_payload)
      returning id into v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function post_to_feed(uuid, uuid, uuid) to authenticated;
