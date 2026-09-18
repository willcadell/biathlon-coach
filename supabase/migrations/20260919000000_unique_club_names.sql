-- 545-coaching: club names must be unique — case-insensitively and ignoring
-- surrounding whitespace, so "cnsc" and "CNSC " count as the same club
-- rather than letting duplicates like the ones this migration follows from
-- pile up silently. The client already trims before sending a name; this is
-- the backstop that makes it true regardless of caller.

create unique index clubs_name_unique_idx on clubs (lower(trim(name)));

-- Re-checks the name itself before the insert, so a duplicate fails with a
-- clear reason instead of a raw "duplicate key value violates constraint
-- ..." surfacing straight from Postgres.
create or replace function create_club(p_name text)
returns table (id uuid, name text, join_code text, coach_join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_join_code text := random_join_code();
  v_coach_code text := random_join_code();
begin
  if not exists (select 1 from coaches where coaches.id = auth.uid()) then
    raise exception 'Only a coach can create a club';
  end if;

  if exists (select 1 from clubs where lower(trim(clubs.name)) = lower(trim(p_name))) then
    raise exception 'A club named "%" already exists — pick a different name.', p_name;
  end if;

  insert into clubs (name, created_by, join_code, coach_join_code)
    values (p_name, auth.uid(), v_join_code, v_coach_code)
    returning clubs.id into v_id;

  insert into coach_assignments (coach_id, club_id, program_id, is_admin)
    values (auth.uid(), v_id, null, true);

  return query select v_id, p_name, v_join_code, v_coach_code;
end;
$$;
grant execute on function create_club(text) to authenticated;
