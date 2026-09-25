-- 545-coaching: ring a cowbell for a post in the club feed.
--
-- One cowbell per person per post (tap again to take it back). Anyone who can
-- SEE a post — an athlete or coach of its club — can ring it; that's not
-- re-implemented here, it's inherited: every policy below asks "can this
-- person read the post?" and feed_posts' own policy answers. Athletes and
-- coaches share an id space (both are auth.uid()), so one user_id covers both.
--
-- A cowbell is deleted with its post, and with its ringer's place in the club:
-- someone who leaves or is removed shouldn't leave a count behind on posts
-- they can no longer see.

create table feed_cowbells (
  post_id uuid not null references feed_posts (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table feed_cowbells enable row level security;

create policy "members see cowbells on posts they can see" on feed_cowbells for select using (
  exists (select 1 from feed_posts p where p.id = feed_cowbells.post_id)
);
create policy "members ring cowbells on posts they can see" on feed_cowbells for insert with check (
  user_id = auth.uid()
  and exists (select 1 from feed_posts p where p.id = feed_cowbells.post_id)
);
create policy "take back your own cowbell" on feed_cowbells for delete using (user_id = auth.uid());

-- Idempotent both ways, so a double tap or a retry can't error or double count.
-- Security invoker on purpose: the policies above do the permission checks.
create or replace function set_cowbell(p_post_id uuid, p_on boolean)
returns void
language plpgsql
security invoker
as $$
begin
  if p_on then
    insert into feed_cowbells (post_id, user_id) values (p_post_id, auth.uid())
      on conflict do nothing;
  else
    delete from feed_cowbells where post_id = p_post_id and user_id = auth.uid();
  end if;
end;
$$;
grant execute on function set_cowbell(uuid, boolean) to authenticated;

-- Counts for a page of posts in one round trip, rather than every cowbell row.
create or replace function feed_cowbell_counts(p_post_ids uuid[])
returns table (post_id uuid, rings bigint, mine boolean)
language sql
stable
security invoker
as $$
  select c.post_id, count(*), bool_or(c.user_id = auth.uid())
  from feed_cowbells c
  where c.post_id = any(p_post_ids)
  group by c.post_id;
$$;
grant execute on function feed_cowbell_counts(uuid[]) to authenticated;

-- Still a member of the club, as an athlete or as a coach?
create or replace function is_club_member(p_user_id uuid, p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from athlete_memberships where athlete_id = p_user_id and club_id = p_club_id)
      or exists (select 1 from coach_assignments where coach_id = p_user_id and club_id = p_club_id);
$$;

create or replace function remove_cowbells_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_club uuid := old.club_id;
begin
  v_user := case tg_table_name when 'athlete_memberships' then old.athlete_id else old.coach_id end;
  if not is_club_member(v_user, v_club) then
    delete from feed_cowbells c using feed_posts p
      where c.post_id = p.id and p.club_id = v_club and c.user_id = v_user;
  end if;
  return old;
end;
$$;

create trigger athlete_left_club_remove_cowbells
  after delete on athlete_memberships
  for each row execute function remove_cowbells_on_leave();
create trigger coach_left_club_remove_cowbells
  after delete on coach_assignments
  for each row execute function remove_cowbells_on_leave();

-- An athlete's running tally: bells on their own posts, from other people
-- only, so ringing your own post can't pad it.
create or replace function my_cowbell_total()
returns bigint
language sql
stable
security invoker
as $$
  select count(*)
  from feed_cowbells c
  join feed_posts p on p.id = c.post_id
  where p.athlete_id = auth.uid() and c.user_id <> auth.uid();
$$;
grant execute on function my_cowbell_total() to authenticated;
