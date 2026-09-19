-- 545-coaching: an athlete join code per program, not just per club.
--
-- Entering a program's code joins the club too if the athlete isn't already
-- a member — one code, one step — and if they're already a club member
-- (with or without a program), it moves that same membership row into the
-- program rather than creating a second row for the same club.

alter table programs add column join_code text unique default random_join_code();
update programs set join_code = random_join_code() where join_code is null;
alter table programs alter column join_code set not null;

-- Mirrors find_club_by_join_code — the code itself is the credential, not
-- the caller's existing access, so this runs regardless of RLS.
create or replace function find_program_by_join_code(p_code text)
returns table (id uuid, name text, club_id uuid, club_name text)
language sql
stable
security definer
set search_path = public
as $$
  select programs.id, programs.name, programs.club_id, clubs.name
  from programs join clubs on clubs.id = programs.club_id
  where programs.join_code = p_code;
$$;
grant execute on function find_program_by_join_code(text) to authenticated;

create or replace function join_program_as_athlete(p_code text)
returns table (id uuid, name text, club_id uuid, club_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_program_name text;
  v_club_id uuid;
  v_club_name text;
begin
  if not exists (select 1 from athletes where athletes.id = auth.uid()) then
    raise exception 'Only an athlete can join a program';
  end if;

  select programs.id, programs.name, programs.club_id, clubs.name
    into v_program_id, v_program_name, v_club_id, v_club_name
  from programs join clubs on clubs.id = programs.club_id
  where programs.join_code = p_code;

  if v_program_id is null then
    raise exception 'Invalid program code';
  end if;

  update athlete_memberships
    set program_id = v_program_id
    where athlete_memberships.athlete_id = auth.uid()
      and athlete_memberships.club_id = v_club_id;

  if not found then
    insert into athlete_memberships (athlete_id, club_id, program_id)
      values (auth.uid(), v_club_id, v_program_id);
  end if;

  return query select v_program_id, v_program_name, v_club_id, v_club_name;
end;
$$;
grant execute on function join_program_as_athlete(text) to authenticated;

-- Hardened alongside the above: previously this always inserted a fresh
-- (club, null-program) row, which — now that a membership can carry a
-- program — could land a second row for a club the athlete already
-- belongs to (with a program set) if they ever entered a plain club code
-- afterward. Checking for any existing row for that club first keeps one
-- membership row per (athlete, club), same as join_program_as_athlete.
create or replace function join_club_as_athlete(p_code text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  if not exists (select 1 from athletes where athletes.id = auth.uid()) then
    raise exception 'Only an athlete can join a club as an athlete';
  end if;

  select clubs.id, clubs.name into v_id, v_name from clubs where clubs.join_code = p_code;
  if v_id is null then
    raise exception 'Invalid join code';
  end if;

  if not exists (
    select 1 from athlete_memberships
    where athlete_memberships.athlete_id = auth.uid() and athlete_memberships.club_id = v_id
  ) then
    insert into athlete_memberships (athlete_id, club_id) values (auth.uid(), v_id);
  end if;

  return query select v_id, v_name;
end;
$$;
