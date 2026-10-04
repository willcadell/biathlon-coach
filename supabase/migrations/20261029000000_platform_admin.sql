-- 545-coaching: a platform admin — the operator of the app — can look at what is
-- happening in any club, read-only, accountably.
--
-- This is deliberately not a hidden back door:
--   * It is a role in its own right, granted only from the SQL editor or CLI
--     (platform_admins has no policies), never from the app.
--   * It is read-only. Only SELECT policies are widened; no write path gains
--     anything. In particular writing a coach note still needs a real link to
--     the athlete (that policy is untouched), and announcements, program
--     changes and the rest still need a real coach assignment.
--   * It is not a club coach, so it does not appear on any club's coach list.
--     That is disclosed in the privacy policy and the join notice instead.
--   * It requires the same coach responsibilities agreement as any coach.
--   * It only reaches what a coach could: an athlete's private goals stay private.
--   * Test (dev mode) data is still hidden outside dev mode, and vice versa.
--   * Every time the app opens a club or an athlete for it, that is logged
--     (platform_access_log), and an athlete can read the entries about
--     themselves. The log is written by the app's own screens, so it records
--     in-app use; it can't stop someone with direct database access, who could
--     read the same data anyway.
--
--   insert into platform_admins (user_id) select id from auth.users where email = '...';
--   delete from platform_admins where user_id = '...';

create table platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

create or replace function is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = p_user_id);
$$;

-- The app asks this to decide whether to offer the platform view.
create or replace function i_am_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_platform_admin(auth.uid());
$$;

-- Platform read access counts only once they've agreed to the coach
-- responsibilities, like any coach.
create or replace function platform_may_read()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_platform_admin(auth.uid()) and coach_has_acknowledged(auth.uid());
$$;

-- Can this person read the athlete's training? A coach with a real link, or a
-- platform admin. Used by SELECT policies only; the note-writing policy keeps
-- calling is_coach_of directly.
create or replace function can_view_athlete(p_viewer_id uuid, p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_coach_of(p_viewer_id, p_athlete_id)
    or (is_platform_admin(p_viewer_id) and coach_has_acknowledged(p_viewer_id));
$$;

-- --- Widen the read policies a coach already has ---------------------------------------

alter policy "coach reads memberships in scope" on athlete_memberships
  using (can_view_athlete(auth.uid(), athlete_id));
alter policy "coach reads linked athletes" on athletes
  using (can_view_athlete(auth.uid(), id));
alter policy "coach reads linked workouts" on workouts
  using (can_view_athlete(auth.uid(), athlete_id));
alter policy "coach reads linked precision bouts" on precision_bouts
  using (can_view_athlete(auth.uid(), athlete_id));
alter policy "coach reads linked metal bouts" on metal_bouts
  using (can_view_athlete(auth.uid(), athlete_id));
alter policy "coach reads linked click log" on click_adjustments
  using (exists (
    select 1 from workouts
    where workouts.id = click_adjustments.workout_id and can_view_athlete(auth.uid(), workouts.athlete_id)
  ));
alter policy "coach reads notes on linked workouts" on workout_coach_notes
  using (exists (
    select 1 from workouts
    where workouts.id = workout_coach_notes.workout_id and can_view_athlete(auth.uid(), workouts.athlete_id)
  ));
-- Only goals the athlete chose to share, same as for a coach.
alter policy "coaches read goals the athlete shared" on goals
  using (scope = 'athlete' and shared and can_view_athlete(auth.uid(), athlete_id));

-- --- Club structure and the feed, read-only -----------------------------------------------

create policy "platform admin reads clubs" on clubs for select using (platform_may_read());
create policy "platform admin reads programs" on programs for select using (platform_may_read());
create policy "platform admin reads coach assignments" on coach_assignments for select using (platform_may_read());
create policy "platform admin reads coaches" on coaches for select using (platform_may_read());
create policy "platform admin reads the feed" on feed_posts for select using (platform_may_read());

-- --- Accountability ---------------------------------------------------------------------------

create table platform_access_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('open_club', 'open_athlete')),
  club_id uuid references clubs (id) on delete set null,
  club_name text,
  athlete_id uuid references athletes (id) on delete set null,
  athlete_name text,
  at timestamptz not null default now()
);
create index platform_access_log_athlete on platform_access_log (athlete_id, at desc);
alter table platform_access_log enable row level security;
-- Platform admins read the log; an athlete reads the entries about themselves.
-- Nobody can write, change or delete it through the API: only the function below.
create policy "platform admin reads the access log" on platform_access_log for select using (is_platform_admin(auth.uid()));
create policy "athlete reads access to their own data" on platform_access_log for select using (athlete_id = auth.uid());

create or replace function log_platform_access(p_action text, p_club_id uuid, p_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not platform_may_read() then
    raise exception 'Not available';
  end if;
  insert into platform_access_log (admin_id, action, club_id, club_name, athlete_id, athlete_name)
    values (
      auth.uid(), p_action, p_club_id, (select name from clubs where id = p_club_id),
      p_athlete_id, (select display_name from athletes where id = p_athlete_id)
    );
end;
$$;

-- --- Grants: signed-in only --------------------------------------------------------------------

revoke execute on function is_platform_admin(uuid) from public, anon;
revoke execute on function i_am_platform_admin() from public, anon;
revoke execute on function platform_may_read() from public, anon;
revoke execute on function can_view_athlete(uuid, uuid) from public, anon;
revoke execute on function log_platform_access(text, uuid, uuid) from public, anon;
grant execute on function is_platform_admin(uuid) to authenticated;
grant execute on function i_am_platform_admin() to authenticated;
grant execute on function platform_may_read() to authenticated;
grant execute on function can_view_athlete(uuid, uuid) to authenticated;
grant execute on function log_platform_access(text, uuid, uuid) to authenticated;
