-- 545-coaching: a coach's tally of bells earned on their announcements.
--
-- my_cowbell_total counted bells on posts where the caller is the athlete
-- author. An announcement has a coach author and no athlete, so it wasn't
-- counted. Athletes and coaches share one id (both are auth.uid()), so this
-- counts a post as yours if you're either — someone who is both gets one
-- combined total. Still only other people's bells: ringing your own post or
-- announcement can't pad it.

create or replace function my_cowbell_total()
returns bigint
language sql
stable
security invoker
as $$
  select count(*)
  from feed_cowbells c
  join feed_posts p on p.id = c.post_id
  where (p.athlete_id = auth.uid() or p.coach_id = auth.uid())
    and c.user_id <> auth.uid();
$$;
grant execute on function my_cowbell_total() to authenticated;
