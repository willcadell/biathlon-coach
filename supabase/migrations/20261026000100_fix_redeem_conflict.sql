-- 545-coaching: fix for redeem_personal_coach_invite from 20261026000000.
--
-- Its output column `athlete_id` is also a PL/pgSQL variable, so the bare column
-- list in ON CONFLICT (athlete_id, coach_id) was ambiguous and every redeem
-- failed. Naming the constraint avoids the clash.

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
    on conflict on constraint personal_coach_requests_pkey do update set requested_at = now(), expires_at = now() + interval '7 days';
  delete from personal_coach_invites where personal_coach_invites.athlete_id = v_invite.athlete_id;

  return query select v_invite.athlete_id, a.display_name from athletes a where a.id = v_invite.athlete_id;
end;
$$;

revoke execute on function redeem_personal_coach_invite(text) from public, anon;
grant execute on function redeem_personal_coach_invite(text) to authenticated;
