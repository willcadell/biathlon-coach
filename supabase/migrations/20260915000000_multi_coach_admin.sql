-- 545-coaching: multiple coaches per club, with one admin who can invite
-- the others.
--
-- Also closes a real gap from the previous migration: "athlete manages own
-- memberships" / "coach manages own assignments" allowed a plain INSERT
-- from any signed-in identity into any club_id it already knew, with
-- nothing at the database level actually checking a join code — the code
-- check only happened in the app's UI before that insert, which a direct
-- API call could just skip. Joining now goes through a security-definer
-- function that verifies the code itself; the tables no longer accept a
-- bare client-side insert at all.

alter table coach_assignments add column is_admin boolean not null default false;
alter table clubs add column coach_join_code text unique;

-- Same alphabet as the client's original generator (ambiguous characters
-- excluded) — now generated here so a join code is never created any way
-- other than through create_club below.
create or replace function random_join_code() returns text
language plpgsql
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
  raw bytea := gen_random_bytes(6);
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(raw, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

-- Creates a club and assigns its creator as the club's admin coach, in one
-- transaction — without both halves, a club could exist with nobody able
-- to see its own roster, or a coach_assignment could point at a club that
-- never got created.
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

  insert into clubs (name, created_by, join_code, coach_join_code)
    values (p_name, auth.uid(), v_join_code, v_coach_code)
    returning clubs.id into v_id;

  insert into coach_assignments (coach_id, club_id, program_id, is_admin)
    values (auth.uid(), v_id, null, true);

  return query select v_id, p_name, v_join_code, v_coach_code;
end;
$$;
grant execute on function create_club(text) to authenticated;

-- Resolves an athlete join code to the club it belongs to, same pattern as
-- find_club_by_join_code but for the separate coach invite code — kept
-- distinct so a code meant for one purpose can never be used for the
-- other.
create or replace function find_club_by_coach_code(p_code text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select clubs.id, clubs.name from clubs where clubs.coach_join_code = p_code;
$$;
grant execute on function find_club_by_coach_code(text) to authenticated;

-- The actual join, for an athlete — verifies the code itself rather than
-- trusting that the caller already checked it client-side.
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

  insert into athlete_memberships (athlete_id, club_id) values (auth.uid(), v_id)
  on conflict do nothing;

  return query select v_id, v_name;
end;
$$;
grant execute on function join_club_as_athlete(text) to authenticated;

-- The actual join, for a coach invited by an admin's code — never sets
-- is_admin, so an invited coach can see and manage the roster but can't
-- invite further coaches themselves.
create or replace function join_club_as_coach(p_code text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  if not exists (select 1 from coaches where coaches.id = auth.uid()) then
    raise exception 'Only a coach can join a club as a coach';
  end if;

  select clubs.id, clubs.name into v_id, v_name from clubs where clubs.coach_join_code = p_code;
  if v_id is null then
    raise exception 'Invalid coach invite code';
  end if;

  insert into coach_assignments (coach_id, club_id, program_id, is_admin)
  values (auth.uid(), v_id, null, false)
  on conflict do nothing;

  return query select v_id, v_name;
end;
$$;
grant execute on function join_club_as_coach(text) to authenticated;

-- The coach invite code is deliberately not exposed through the clubs
-- table's own SELECT policy (every coach on the club can already read that
-- row) — only the admin coach can retrieve it, which is what actually
-- makes "one coach invites the others" true rather than a UI-only
-- suggestion. Returns null rather than raising for a non-admin caller, so
-- the client can treat "no code" and "not allowed" the same way.
create or replace function get_coach_join_code(p_club_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select clubs.coach_join_code from clubs
  where clubs.id = p_club_id
    and exists (
      select 1 from coach_assignments
      where coach_assignments.club_id = p_club_id
        and coach_assignments.coach_id = auth.uid()
        and coach_assignments.is_admin = true
    );
$$;
grant execute on function get_coach_join_code(uuid) to authenticated;

-- Replace the old "manages own, including insert" policies: insert now
-- only ever happens inside the security-definer functions above, which
-- bypass RLS on the caller's behalf regardless of what's granted here — a
-- plain client insert against either table now has no policy permitting it
-- at all.
drop policy "athlete manages own memberships" on athlete_memberships;
create policy "athlete reads own memberships" on athlete_memberships for select using (athlete_id = auth.uid());
create policy "athlete leaves own memberships" on athlete_memberships for delete using (athlete_id = auth.uid());

drop policy "coach manages own assignments" on coach_assignments;
create policy "coach reads own assignments" on coach_assignments for select using (coach_id = auth.uid());
create policy "coach leaves own assignments" on coach_assignments for delete using (coach_id = auth.uid());
-- A club's coaches can see each other — needed for a roster of "who else
-- coaches here," not just "who do I coach."
create policy "coach reads co-coaches in same club" on coach_assignments for select using (
  exists (
    select 1 from coach_assignments mine
    where mine.coach_id = auth.uid() and mine.club_id = coach_assignments.club_id
  )
);
