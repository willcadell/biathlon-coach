-- 545-coaching: a coach can post a text announcement to the club feed.
--
-- Announcements share the feed, so they get everything a post gets — the same
-- visibility (the club's athletes and coaches), the same removal rules (any
-- coach at the club), and cowbells — for free. What differs is the author:
-- feed_posts belonged to an athlete, and a coach isn't one, so an announcement
-- carries coach_id instead and has no athlete.
--
-- Deliberately NOT tied to the coach's place in the club the way an athlete's
-- posts are: an athlete's posts go when they leave because they only consented
-- to show them to that club; an announcement is the club's own voice and stays
-- until a coach removes it.

alter table feed_posts alter column athlete_id drop not null;
alter table feed_posts add column coach_id uuid references coaches (id) on delete cascade;

alter table feed_posts drop constraint feed_posts_kind_check;
alter table feed_posts add constraint feed_posts_kind_check
  check (kind in ('target', 'workout', 'announcement'));

alter table feed_posts drop constraint feed_posts_check;
alter table feed_posts add constraint feed_posts_shape_check check (
  (kind = 'target'       and bout_id is not null and workout_id is null and athlete_id is not null and coach_id is null)
  or (kind = 'workout'   and workout_id is not null and bout_id is null and athlete_id is not null and coach_id is null)
  or (kind = 'announcement' and bout_id is null and workout_id is null and athlete_id is null and coach_id is not null
      and char_length(payload->>'text') between 1 and 500)
);

-- Any coach assigned to the club, not just its admin — same as adding a
-- program or removing a post. The text is trimmed and length-checked here as
-- well as by the constraint above, so the person gets a plain message rather
-- than a raw constraint error.
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
grant execute on function post_announcement(uuid, text) to authenticated;
