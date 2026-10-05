-- 545-coaching: a coach identity can be a dev-mode (test) identity.
--
-- A developer's coaching persona can exist only in dev mode, so athletes never
-- see them as a coach. It works like every other kind of test data here:
--   * a coach row created in dev mode is stamped is_test, and one can be marked
--     from the SQL editor for an existing coach;
--   * a test coach is only visible in dev mode, and only to its own account;
--   * outside dev mode it holds no authority: is_coach_of is false for it, so
--     it reads no athlete's training, and the lists athletes see leave it out.
-- Any club assignment the coach already has is left in place, not deleted; it
-- simply does nothing outside dev mode.

alter table coaches add column is_test boolean not null default false;

create trigger stamp_test_row before insert or update on coaches
  for each row execute function stamp_test_row();

create policy "test data stays in dev mode" on coaches as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or id = auth.uid()));

-- A coach counts as one only when it matches the mode of the request.
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
  ) and exists (
    select 1 from coaches c where c.id = p_coach_id and c.is_test = in_dev_mode()
  );
$$;

-- The coaches an athlete is told can see them: never a test coach outside dev mode.
create or replace function my_club_coaches()
returns table (club_id uuid, coach_id uuid, coach_name text, is_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select am.club_id, c.id, c.display_name, bool_or(ca.is_admin)
  from athlete_memberships am
  join coach_assignments ca on ca.club_id = am.club_id
    and (ca.program_id is null or ca.is_admin or ca.program_id = am.program_id)
  join coaches c on c.id = ca.coach_id and c.is_test = in_dev_mode()
  where am.athlete_id = auth.uid()
  group by am.club_id, c.id, c.display_name
  order by c.display_name;
$$;

revoke execute on function is_coach_of(uuid, uuid) from public, anon;
grant execute on function is_coach_of(uuid, uuid) to authenticated;
revoke execute on function my_club_coaches() from public, anon;
grant execute on function my_club_coaches() to authenticated;
