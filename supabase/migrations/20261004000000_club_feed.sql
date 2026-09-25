-- 545-coaching: a club feed of targets and workouts athletes choose to share.
--
-- Nothing is ever posted automatically: a post exists only because its
-- athlete called post_to_feed on one of their own bouts or workouts.
--
-- Posts hold a SNAPSHOT built inside post_to_feed, not a live view of the
-- source: editing a bout later doesn't silently change what the club saw,
-- and — more importantly — what a post can contain is decided here, in one
-- place, not by whatever the client sends. Shared: the ring diagram data,
-- score, position and date for a target; name, date, type and headline
-- numbers for a workout. Never shared: notes, coach notes, the zero-click
-- log, the original target photo.
--
-- Visible to the club's athletes and coaches. Removed with the source (a
-- deleted bout or workout takes its post with it), when the athlete leaves
-- the club, or by the author or any coach at the club.

create table feed_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  author_name text not null,
  kind text not null check (kind in ('target', 'workout')),
  bout_id uuid references precision_bouts (id) on delete cascade,
  workout_id uuid references workouts (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  check (
    (kind = 'target' and bout_id is not null and workout_id is null)
    or (kind = 'workout' and workout_id is not null and bout_id is null)
  )
);

create unique index feed_posts_one_per_bout on feed_posts (club_id, bout_id) where bout_id is not null;
create unique index feed_posts_one_per_workout on feed_posts (club_id, workout_id) where workout_id is not null;
create index feed_posts_recent on feed_posts (club_id, created_at desc);

alter table feed_posts enable row level security;

create policy "club members read the feed" on feed_posts for select using (
  exists (select 1 from athlete_memberships m where m.club_id = feed_posts.club_id and m.athlete_id = auth.uid())
  or exists (select 1 from coach_assignments c where c.club_id = feed_posts.club_id and c.coach_id = auth.uid())
);

-- No insert or update policy on purpose: rows only come from post_to_feed.
create policy "author or club coach removes a post" on feed_posts for delete using (
  athlete_id = auth.uid()
  or exists (select 1 from coach_assignments c where c.club_id = feed_posts.club_id and c.coach_id = auth.uid())
);

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

-- Leaving a club (or being removed from it) takes that athlete's posts with
-- them: they only ever consented to show them to that club's members.
create or replace function remove_feed_posts_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from feed_posts where athlete_id = old.athlete_id and club_id = old.club_id;
  return old;
end;
$$;

create trigger athlete_left_club_remove_feed_posts
  after delete on athlete_memberships
  for each row execute function remove_feed_posts_on_leave();
