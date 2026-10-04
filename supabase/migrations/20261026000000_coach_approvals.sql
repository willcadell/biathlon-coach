-- 545-coaching: a coach is a position of authority, so gaining access to
-- people takes a yes from the people it affects.
--
--   * A personal coach no longer attaches the moment they enter an athlete's
--     invite code: that creates a request, and the athlete approves or
--     declines it.
--   * A coach joining a club with the coach invite code no longer attaches
--     either: it creates a request, and a club admin approves or declines it.
--   * Before a coach can create a club, ask to join one or ask to follow an
--     athlete — or post to or write on others' behalf — they must have
--     acknowledged the coach responsibilities (which lead with the Canadian
--     Safe Sport Program's Universal Code of Conduct).
--
-- Existing links are untouched. Revoking an existing link was already possible
-- (the athlete removes a personal coach, an admin removes a coach, either
-- side can step away) and is unchanged.

-- --- Acknowledging the coach responsibilities ----------------------------------

-- Bump this when the wording changes materially; everyone then agrees again.
create or replace function required_coach_ack_version()
returns int
language sql
immutable
as $$ select 1 $$;

create table coach_acknowledgements (
  coach_id uuid primary key references coaches (id) on delete cascade,
  version int not null,
  accepted_at timestamptz not null default now()
);
alter table coach_acknowledgements enable row level security;
-- Read-only to the coach; only accept_coach_responsibilities writes it, so the
-- record can't be set by a direct API call that skipped the screen.
create policy "coach reads own acknowledgement" on coach_acknowledgements for select using (coach_id = auth.uid());

create or replace function coach_has_acknowledged(p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from coach_acknowledgements
    where coach_id = p_coach_id and version >= required_coach_ack_version()
  );
$$;

create or replace function accept_coach_responsibilities(p_version int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from coaches where id = auth.uid()) then
    raise exception 'Set up a coaching identity first';
  end if;
  if p_version < required_coach_ack_version() then
    raise exception 'Those responsibilities have been updated — please read the current ones';
  end if;
  insert into coach_acknowledgements (coach_id, version) values (auth.uid(), p_version)
    on conflict (coach_id) do update set version = excluded.version, accepted_at = now();
end;
$$;

create or replace function require_coach_ack()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coach_has_acknowledged(auth.uid()) then
    raise exception 'Read and agree to the coach responsibilities first';
  end if;
end;
$$;

-- --- Requests -------------------------------------------------------------------

create table personal_coach_requests (
  athlete_id uuid not null references athletes (id) on delete cascade,
  coach_id uuid not null references coaches (id) on delete cascade,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key (athlete_id, coach_id)
);
alter table personal_coach_requests enable row level security;
-- A coach sees, and can withdraw, their own pending requests. The athlete reads
-- theirs through my_personal_coach_requests (which adds the coach's name).
create policy "coach sees own follow requests" on personal_coach_requests for select using (coach_id = auth.uid());
create policy "coach withdraws own follow request" on personal_coach_requests for delete using (coach_id = auth.uid());

create table coach_join_requests (
  club_id uuid not null references clubs (id) on delete cascade,
  coach_id uuid not null references coaches (id) on delete cascade,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  primary key (club_id, coach_id)
);
alter table coach_join_requests enable row level security;
create policy "coach sees own join requests" on coach_join_requests for select using (coach_id = auth.uid());
create policy "coach withdraws own join request" on coach_join_requests for delete using (coach_id = auth.uid());

-- --- Personal coach: request, then the athlete decides ---------------------------

create or replace function redeem_personal_coach_invite(p_code text)
returns table (athlete_id uuid, athlete_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite personal_coach_invites%rowtype;
begin
  if not exists (select 1 from coaches where id = auth.uid()) then
    raise exception 'Set up a coaching identity first, then enter the code';
  end if;
  perform require_coach_ack();

  select * into v_invite from personal_coach_invites
    where code = upper(btrim(p_code)) and expires_at > now();
  if not found then
    raise exception 'That invite code isn''t valid or has expired';
  end if;

  if v_invite.athlete_id = auth.uid() then
    raise exception 'You can''t be your own personal coach';
  end if;
  if exists (select 1 from personal_coaches pc where pc.athlete_id = v_invite.athlete_id and pc.coach_id = auth.uid()) then
    raise exception 'You already follow that athlete';
  end if;

  -- Nothing is shared yet: this is a request, and the athlete decides.
  insert into personal_coach_requests (athlete_id, coach_id) values (v_invite.athlete_id, auth.uid())
    on conflict (athlete_id, coach_id) do update set requested_at = now(), expires_at = now() + interval '7 days';
  delete from personal_coach_invites where personal_coach_invites.athlete_id = v_invite.athlete_id;

  return query select v_invite.athlete_id, a.display_name from athletes a where a.id = v_invite.athlete_id;
end;
$$;

-- The athlete's waiting requests, with the name of whoever is asking.
create or replace function my_personal_coach_requests()
returns table (coach_id uuid, coach_name text, requested_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.coach_id, c.display_name, r.requested_at
  from personal_coach_requests r join coaches c on c.id = r.coach_id
  where r.athlete_id = auth.uid() and r.expires_at > now()
  order by r.requested_at;
$$;

create or replace function respond_personal_coach_request(p_coach_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from personal_coach_requests
    where athlete_id = auth.uid() and coach_id = p_coach_id and expires_at > now()
  ) then
    raise exception 'That request isn''t there any more — it may have expired or been withdrawn';
  end if;

  delete from personal_coach_requests where athlete_id = auth.uid() and coach_id = p_coach_id;
  if p_approve then
    insert into personal_coaches (coach_id, athlete_id) values (p_coach_id, auth.uid())
      on conflict do nothing;
  end if;
end;
$$;

-- --- Club coach: request, then a club admin decides -------------------------------

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
  perform require_coach_ack();

  select clubs.id, clubs.name into v_id, v_name from clubs where clubs.coach_join_code = p_code;
  if v_id is null then
    raise exception 'Invalid coach invite code';
  end if;

  if exists (select 1 from coach_assignments ca where ca.club_id = v_id and ca.coach_id = auth.uid()) then
    raise exception 'You already coach that club';
  end if;

  -- Not a coach of the club yet: an admin has to approve first.
  insert into coach_join_requests (club_id, coach_id) values (v_id, auth.uid())
    on conflict (club_id, coach_id) do update set requested_at = now(), expires_at = now() + interval '14 days';

  return query select v_id, v_name;
end;
$$;

create or replace function club_coach_requests(p_club_id uuid)
returns table (coach_id uuid, coach_name text, requested_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.coach_id, c.display_name, r.requested_at
  from coach_join_requests r join coaches c on c.id = r.coach_id
  where r.club_id = p_club_id and r.expires_at > now()
    and exists (
      select 1 from coach_assignments a
      where a.club_id = p_club_id and a.coach_id = auth.uid() and a.is_admin
    )
  order by r.requested_at;
$$;

create or replace function respond_coach_join_request(p_club_id uuid, p_coach_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from coach_assignments
    where club_id = p_club_id and coach_id = auth.uid() and is_admin
  ) then
    raise exception 'Only this club''s admin coach can approve a coach';
  end if;
  if not exists (
    select 1 from coach_join_requests
    where club_id = p_club_id and coach_id = p_coach_id and expires_at > now()
  ) then
    raise exception 'That request isn''t there any more — it may have expired or been withdrawn';
  end if;

  delete from coach_join_requests where club_id = p_club_id and coach_id = p_coach_id;
  if p_approve then
    -- Never admin: an approved coach can't approve further coaches themselves.
    insert into coach_assignments (coach_id, club_id, program_id, is_admin)
      values (p_coach_id, p_club_id, null, false)
      on conflict do nothing;
  end if;
end;
$$;

-- --- The other doors a coach walks through -----------------------------------------

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
  perform require_coach_ack();

  if exists (select 1 from clubs where lower(trim(clubs.name)) = lower(trim(p_name))) then
    raise exception 'A club named ""%"" already exists — pick a different name.', p_name;
  end if;

  insert into clubs (name, created_by, join_code, coach_join_code)
    values (p_name, auth.uid(), v_join_code, v_coach_code)
    returning clubs.id into v_id;

  insert into coach_assignments (coach_id, club_id, program_id, is_admin)
    values (auth.uid(), v_id, null, true);

  return query select v_id, p_name, v_join_code, v_coach_code;
end;
$$;

create or replace function post_announcement(p_club_id uuid, p_text text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_name text;
  v_id uuid;
begin
  if not exists (
    select 1 from coach_assignments where coach_id = auth.uid() and club_id = p_club_id
  ) then
    raise exception 'Only a coach at this club can post an announcement';
  end if;
  perform require_coach_ack();

  if char_length(v_text) = 0 then
    raise exception 'Write something to announce';
  end if;
  if char_length(v_text) > 500 then
    raise exception 'Announcements are limited to 500 characters';
  end if;

  select display_name into v_name from coaches where id = auth.uid();

  insert into feed_posts (club_id, coach_id, author_name, kind, payload)
    values (p_club_id, auth.uid(), coalesce(v_name, ''), 'announcement', jsonb_build_object('text', v_text))
    returning id into v_id;
  return v_id;
end;
$$;

-- Writing on an athlete's workout is the most direct contact a coach has.
drop policy "coach adds notes on linked workouts" on workout_coach_notes;
create policy "coach adds notes on linked workouts" on workout_coach_notes for insert with check (
  coach_id = auth.uid()
  and coach_has_acknowledged(auth.uid())
  and exists (
    select 1 from workouts
    where workouts.id = workout_coach_notes.workout_id and is_coach_of(auth.uid(), workouts.athlete_id)
  )
);

-- --- Grants: signed-in only ----------------------------------------------------------

revoke execute on function required_coach_ack_version() from public, anon;
revoke execute on function coach_has_acknowledged(uuid) from public, anon;
revoke execute on function accept_coach_responsibilities(int) from public, anon;
revoke execute on function require_coach_ack() from public, anon;
revoke execute on function my_personal_coach_requests() from public, anon;
revoke execute on function respond_personal_coach_request(uuid, boolean) from public, anon;
revoke execute on function club_coach_requests(uuid) from public, anon;
revoke execute on function respond_coach_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function required_coach_ack_version() to authenticated;
grant execute on function coach_has_acknowledged(uuid) to authenticated;
grant execute on function accept_coach_responsibilities(int) to authenticated;
grant execute on function require_coach_ack() to authenticated;
grant execute on function my_personal_coach_requests() to authenticated;
grant execute on function respond_personal_coach_request(uuid, boolean) to authenticated;
grant execute on function club_coach_requests(uuid) to authenticated;
grant execute on function respond_coach_join_request(uuid, uuid, boolean) to authenticated;
-- Re-created above, so their grants are re-stated.
revoke execute on function redeem_personal_coach_invite(text) from public, anon;
revoke execute on function join_club_as_coach(text) from public, anon;
revoke execute on function create_club(text) from public, anon;
revoke execute on function post_announcement(uuid, text) from public, anon;
grant execute on function redeem_personal_coach_invite(text) to authenticated;
grant execute on function join_club_as_coach(text) to authenticated;
grant execute on function create_club(text) to authenticated;
grant execute on function post_announcement(uuid, text) to authenticated;
