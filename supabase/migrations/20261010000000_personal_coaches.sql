-- 545-coaching: personal coaches (formerly the "parent/guardian" link).
--
-- A personal coach is one individual who follows one athlete — a parent, or a
-- coach outside the athlete's club — regardless of club or program. They can
-- see that athlete's sessions, analysis and posts, and the announcements made
-- by the coaches of the athlete's club. They can NOT see the rest of the club
-- feed, and (as for every coach) never the athlete's target photos.
--
-- It starts with the athlete: they create an invite, hand the code to the
-- person, and that person accepts it. Neither side can create the link alone —
-- the athlete can't push themselves onto a coach, and a coach can't claim an
-- athlete. Either side can end it at any time.
--
-- The relationship already existed as guardian_links, and is_coach_of already
-- honours it for workouts, bouts, notes and the athlete's name; this renames
-- it, closes how a link gets made, and extends it to the feed.

alter table guardian_links rename to personal_coaches;

-- Links can only be created by redeeming an invite. Dropping the old
-- "for all" athlete policy also drops the ability to insert one directly.
drop policy "athlete manages own guardian links" on personal_coaches;
drop policy "coach reads own guardian links" on personal_coaches;

create policy "athlete sees own personal coaches" on personal_coaches for select using (athlete_id = auth.uid());
create policy "athlete removes a personal coach" on personal_coaches for delete using (athlete_id = auth.uid());
create policy "personal coach sees own athletes" on personal_coaches for select using (coach_id = auth.uid());
create policy "personal coach steps away" on personal_coaches for delete using (coach_id = auth.uid());

-- An athlete needs to read their personal coaches' names to list them.
create policy "athlete reads own personal coaches' names" on coaches for select using (
  exists (
    select 1 from personal_coaches pc
    where pc.coach_id = coaches.id and pc.athlete_id = auth.uid()
  )
);

-- The same is_coach_of as before (club path incl. the admin widening), with
-- the personal-coach path pointing at the renamed table.
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

-- --- Invites -----------------------------------------------------------------
-- One live invite per athlete: making a new one replaces the old. Single-use
-- and short-lived, because the code is the credential.

create table personal_coach_invites (
  athlete_id uuid primary key references athletes (id) on delete cascade,
  code text not null unique default random_join_code(),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
alter table personal_coach_invites enable row level security;
create policy "athlete sees own invite" on personal_coach_invites for select using (athlete_id = auth.uid());
create policy "athlete cancels own invite" on personal_coach_invites for delete using (athlete_id = auth.uid());

create or replace function create_personal_coach_invite()
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from athletes where id = auth.uid()) then
    raise exception 'Only an athlete can invite a personal coach';
  end if;
  delete from personal_coach_invites where athlete_id = auth.uid();
  return query
    insert into personal_coach_invites (athlete_id) values (auth.uid())
    returning personal_coach_invites.code, personal_coach_invites.expires_at;
end;
$$;
grant execute on function create_personal_coach_invite() to authenticated;

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

  select * into v_invite from personal_coach_invites
    where code = upper(btrim(p_code)) and expires_at > now();
  if not found then
    raise exception 'That invite code isn''t valid or has expired';
  end if;

  if v_invite.athlete_id = auth.uid() then
    raise exception 'You can''t be your own personal coach';
  end if;

  insert into personal_coaches (coach_id, athlete_id) values (auth.uid(), v_invite.athlete_id)
    on conflict do nothing;
  delete from personal_coach_invites where personal_coach_invites.athlete_id = v_invite.athlete_id;

  return query select v_invite.athlete_id, a.display_name from athletes a where a.id = v_invite.athlete_id;
end;
$$;
grant execute on function redeem_personal_coach_invite(text) to authenticated;

-- --- The feed ------------------------------------------------------------------
-- A personal coach sees, of the whole feed: what their athletes posted, and
-- the announcements made in their athletes' clubs. Nothing else. security
-- definer so the check can read memberships without re-triggering their policies.

create or replace function personal_coach_sees_post(p_coach_id uuid, p_post_athlete uuid, p_post_club uuid, p_post_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from personal_coaches pc
    where pc.coach_id = p_coach_id
      and (
        (p_post_athlete is not null and pc.athlete_id = p_post_athlete)
        or (
          p_post_kind = 'announcement'
          and exists (
            select 1 from athlete_memberships m
            where m.athlete_id = pc.athlete_id and m.club_id = p_post_club
          )
        )
      )
  );
$$;

create policy "personal coaches read their athletes' posts and club announcements" on feed_posts for select using (
  personal_coach_sees_post(auth.uid(), athlete_id, club_id, kind)
);
