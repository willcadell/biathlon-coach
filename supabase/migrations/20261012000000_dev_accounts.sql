-- 545-coaching: development accounts.
--
-- A user listed in dev_users is a developer account. Everything it creates —
-- workouts, bouts, click logs, feed posts, announcements, cowbells, coach
-- notes, and its own presence in a club — is test data: visible to that
-- account and nobody else, so it never shows up in a club's feed, a coach's
-- roster or analysis, an athlete's bell count, or a personal coach's view.
--
-- Test-ness is decided by whose data it is, not by a flag on each row. So it
-- covers what an account already holds the moment it is added, needs no
-- change to the app or to any insert, and can't be forgotten on a new table
-- that a dev account writes to. The flip side: removing an account from
-- dev_users makes everything it holds real, so clear its test data first.
--
-- There is deliberately no UI and no policy on dev_users: it can only be
-- edited from the Supabase SQL editor or the CLI.
--
--   insert into dev_users (user_id) select id from auth.users where email = '...';
--   delete from dev_users where user_id = '...';

create table dev_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table dev_users enable row level security;
-- No policies: clients can neither read nor write it.

create or replace function is_dev_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from dev_users where user_id = p_user_id);
$$;

-- --- Athletes ------------------------------------------------------------------
-- Every coach-side read of an athlete — the athlete row, their club membership,
-- workouts, bouts, click logs, notes — goes through is_coach_of, so a dev
-- athlete is invisible to every coach and personal coach but themselves. (A
-- developer who is also a coach can still coach their own test athlete.)

create or replace function is_coach_of(p_coach_id uuid, p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    exists (
      select 1 from athlete_memberships am
      join coach_assignments ca on ca.club_id = am.club_id
        and (ca.program_id is null or ca.is_admin or ca.program_id = am.program_id)
      where am.athlete_id = p_athlete_id and ca.coach_id = p_coach_id
    ) or exists (
      select 1 from personal_coaches
      where personal_coaches.athlete_id = p_athlete_id and personal_coaches.coach_id = p_coach_id
    )
  ) and (p_coach_id = p_athlete_id or not is_dev_user(p_athlete_id));
$$;

-- --- Things a dev account puts in front of other people ------------------------
-- Restrictive policies are ANDed with the permissive ones, so each of these
-- only ever takes rows away. The count functions (feed_cowbell_counts,
-- my_cowbell_total) are security invoker, so they inherit this.

-- Posts and announcements. An announcement has a coach author and no athlete.
create policy "test posts are private to their author" on feed_posts
  as restrictive for select
  using (
    not is_dev_user(coalesce(athlete_id, coach_id))
    or coalesce(athlete_id, coach_id) = auth.uid()
  );

-- A dev account's bells on real posts must not add to anyone's total.
create policy "test cowbells are private to their ringer" on feed_cowbells
  as restrictive for select
  using (not is_dev_user(user_id) or user_id = auth.uid());

-- A dev coach's notes on a real athlete's workout.
create policy "test coach notes are private to their author" on workout_coach_notes
  as restrictive for select
  using (not is_dev_user(coach_id) or coach_id = auth.uid());
