-- 545-coaching: security hardening from a review.
--
-- 1. Functions were callable by anyone. Postgres grants EXECUTE on a new
--    function to PUBLIC, and Supabase also grants it to the anon role, so
--    every function here could be called by someone who wasn't signed in. Most
--    refuse in the body (auth.uid() is null matches nothing), but the join-code
--    lookups and the access predicates (is_coach_of, is_club_member, ...)
--    answered anyone — handy for guessing codes or probing who coaches whom.
--    Nothing in the app calls any function before sign-in, so signed-out
--    callers lose nothing. Trigger functions are left alone: a trigger runs
--    without the caller needing EXECUTE.
-- 2. New functions get the same treatment by default, so a forgotten REVOKE
--    can't reopen this. Each function still grants EXECUTE to authenticated
--    explicitly, as before.
-- 3. A goal can only be marked achieved with a value that actually reaches its
--    target (and, for a rate or score, is a real percentage), so the figure a
--    shared goal puts on a club feed can't be nonsense.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

alter default privileges in schema public revoke execute on functions from public, anon;

alter table goals add constraint goals_achieved_is_real check (
  achieved_at is null
  or (achieved_value is not null and achieved_value >= target
      and (metric = 'dryfire_minutes' or achieved_value <= 100))
);
