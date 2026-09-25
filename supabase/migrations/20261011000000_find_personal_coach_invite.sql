-- 545-coaching: look up a personal-coach invite before accepting it.
--
-- Same two steps as joining a club: enter the code, see who it is, then
-- confirm. Redeeming consumes the code, so a mistyped-but-valid code would
-- otherwise follow the wrong person with no chance to check. This only
-- reveals the athlete's name, and only to a coach holding a live code — the
-- code itself is the credential.

create or replace function find_personal_coach_invite(p_code text)
returns table (athlete_id uuid, athlete_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from coaches where id = auth.uid()) then
    raise exception 'Set up a coaching identity first, then enter the code';
  end if;
  return query
    select i.athlete_id, a.display_name
    from personal_coach_invites i
    join athletes a on a.id = i.athlete_id
    where i.code = upper(btrim(p_code)) and i.expires_at > now() and i.athlete_id <> auth.uid();
end;
$$;
grant execute on function find_personal_coach_invite(text) to authenticated;
