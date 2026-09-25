-- 545-coaching: dev mode (replaces the account-wide approach in 20261012).
--
-- A user listed in dev_users is a developer and may switch the app into dev
-- mode. Dev mode is a mode, not a kind of user: the same account acts as a
-- normal athlete or coach outside it, and everything it does outside dev mode
-- is real. Inside dev mode:
--   * everything the account creates is test data (rows are stamped is_test);
--   * it sees only its own test data — never the club's real feed, and its
--     real data is out of sight — so a session there can't mix with real use.
-- Outside dev mode, test data is invisible to everyone, its owner included, so
-- it never reaches a club's feed, a coach's roster or analysis, an athlete's
-- bell count, or a personal coach's view.
--
-- The app says which mode a request is in with an `x-dev-mode: 1` header. It
-- is only honoured for accounts in dev_users, so sending it as anyone else
-- does nothing. dev_users has no policies: it can only be edited from the
-- Supabase SQL editor or the CLI.
--
--   insert into dev_users (user_id) select id from auth.users where email = '...';
--   delete from dev_users where user_id = '...';

-- Undo the account-wide rules from 20261012 (dev_users was empty).
drop policy "test posts are private to their author" on feed_posts;
drop policy "test cowbells are private to their ringer" on feed_cowbells;
drop policy "test coach notes are private to their author" on workout_coach_notes;

create or replace function is_coach_of(p_coach_id uuid, p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from athlete_memberships am
    join coach_assignments ca on ca.club_id = am.club_id
      and (ca.program_id is null or ca.is_admin or ca.program_id = am.program_id)
    where am.athlete_id = p_athlete_id and ca.coach_id = p_coach_id
  ) or exists (
    select 1 from personal_coaches
    where personal_coaches.athlete_id = p_athlete_id and personal_coaches.coach_id = p_coach_id
  );
$$;

-- --- Who is in dev mode ---------------------------------------------------------

create or replace function in_dev_mode()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-dev-mode', '') = '1'
    and is_dev_user(auth.uid());
$$;

-- The app asks this to decide whether to offer the switch.
create or replace function i_am_dev()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_dev_user(auth.uid());
$$;
grant execute on function i_am_dev() to authenticated;

-- --- Tagging ----------------------------------------------------------------------

alter table workouts            add column is_test boolean not null default false;
alter table precision_bouts     add column is_test boolean not null default false;
alter table metal_bouts         add column is_test boolean not null default false;
alter table click_adjustments   add column is_test boolean not null default false;
alter table workout_coach_notes add column is_test boolean not null default false;
alter table feed_posts          add column is_test boolean not null default false;
alter table feed_cowbells       add column is_test boolean not null default false;

-- The mode of the request decides the tag; a client can't set it. An update
-- can't change it either (only the SQL editor, where there is no signed-in user,
-- can — which is how existing data gets marked).
create or replace function stamp_test_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.is_test := in_dev_mode();
  elsif auth.uid() is not null then
    new.is_test := old.is_test;
  end if;
  return new;
end;
$$;

create trigger stamp_test_row before insert or update on workouts
  for each row execute function stamp_test_row();
create trigger stamp_test_row before insert or update on precision_bouts
  for each row execute function stamp_test_row();
create trigger stamp_test_row before insert or update on metal_bouts
  for each row execute function stamp_test_row();
create trigger stamp_test_row before insert or update on click_adjustments
  for each row execute function stamp_test_row();
create trigger stamp_test_row before insert or update on workout_coach_notes
  for each row execute function stamp_test_row();
create trigger stamp_test_row before insert or update on feed_posts
  for each row execute function stamp_test_row();
create trigger stamp_test_row before insert or update on feed_cowbells
  for each row execute function stamp_test_row();

-- --- Visibility -------------------------------------------------------------------
-- Restrictive policies are ANDed with the permissive ones, so these only ever
-- take rows away. A row is visible only when its tag matches the mode of the
-- request, and test rows only to the account that made them. The count functions
-- (feed_cowbell_counts, my_cowbell_total) are security invoker, so they inherit
-- this.

create policy "test data stays in dev mode" on workouts as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or athlete_id = auth.uid()));

create policy "test data stays in dev mode" on precision_bouts as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or athlete_id = auth.uid()));

create policy "test data stays in dev mode" on metal_bouts as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or athlete_id = auth.uid()));

create policy "test data stays in dev mode" on click_adjustments as restrictive for select
  using (
    is_test = (select in_dev_mode())
    and (not is_test or exists (select 1 from workouts w where w.id = workout_id and w.athlete_id = auth.uid()))
  );

-- An announcement has a coach author and no athlete.
create policy "test data stays in dev mode" on feed_posts as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or coalesce(athlete_id, coach_id) = auth.uid()));

create policy "test data stays in dev mode" on feed_cowbells as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or user_id = auth.uid()));

create policy "test data stays in dev mode" on workout_coach_notes as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or coach_id = auth.uid()));
