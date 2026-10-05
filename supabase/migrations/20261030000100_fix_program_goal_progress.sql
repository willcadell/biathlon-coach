-- 545-coaching: fix for program_goal_progress from 20261030000000.
--
-- Its output columns achieved_at and achieved_value are also PL/pgSQL variables,
-- so the bare achieved_at in the UPDATE's WHERE was ambiguous and the function
-- failed whenever it reached that step. Qualified now.

create or replace function program_goal_progress(p_goal_id uuid)
returns table (
  value numeric,          -- the total so far; null when withheld for privacy
  contributors int,       -- athletes who've contributed
  hidden boolean,         -- true when withheld for privacy (too few contributors)
  achieved_at timestamptz,
  achieved_value numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  g goals%rowtype;
  v_is_coach boolean;
  v_val numeric := 0;
  v_contrib int := 0;
  v_hidden boolean;
  c_min_contributors constant int := 3;
begin
  select * into g from goals where id = p_goal_id and scope = 'program';
  if not found then raise exception 'That goal isn''t there'; end if;

  v_is_coach := coach_can_manage_program(g.program_id);
  if not (
    v_is_coach
    or platform_may_read()
    or exists (select 1 from athlete_memberships m where m.athlete_id = auth.uid() and m.program_id = g.program_id)
  ) then
    raise exception 'That goal isn''t yours to see';
  end if;

  if g.metric = 'dryfire_minutes' then
    select coalesce(sum(w.dryfire_minutes), 0)::numeric,
           count(distinct w.athlete_id) filter (where w.dryfire_minutes > 0)::int
      into v_val, v_contrib
    from workouts w
    join athlete_memberships m on m.athlete_id = w.athlete_id and m.program_id = g.program_id
    where w.is_test = in_dev_mode()
      and (w.started_at at time zone 'UTC')::date between g.starts_on and g.ends_on;
  else -- sessions
    select count(*)::numeric, count(distinct w.athlete_id)::int
      into v_val, v_contrib
    from workouts w
    join athlete_memberships m on m.athlete_id = w.athlete_id and m.program_id = g.program_id
    where w.is_test = in_dev_mode()
      and (w.started_at at time zone 'UTC')::date between g.starts_on and g.ends_on;
  end if;

  v_hidden := not v_is_coach and not platform_may_read() and v_contrib < c_min_contributors;

  -- Recorded once, when met with enough people behind it, so it stays
  -- achieved however the totals move.
  if g.achieved_at is null and v_contrib >= c_min_contributors and v_val >= g.target then
    update goals set achieved_at = now(), achieved_value = v_val
      where goals.id = g.id and goals.achieved_at is null
      returning goals.achieved_at, goals.achieved_value into g.achieved_at, g.achieved_value;
  end if;

  return query select
    case when v_hidden then null else v_val end,
    v_contrib, v_hidden, g.achieved_at, g.achieved_value;
end;
$$;

revoke execute on function program_goal_progress(uuid) from public, anon;
grant execute on function program_goal_progress(uuid) to authenticated;
