-- 545-coaching: program goals.
--
-- A coach who manages a program sets a goal for the whole program. They are
-- about PROCESS, not outcome: how much the group trains, not how well it
-- shoots. Two measures, both totals across the program's athletes:
--   dryfire_minutes  minutes of dry-fire logged
--   sessions         sessions logged (any kind)
-- Hit rates and scores stay personal: they aren't offered for a program.
--
-- The goals table already carries scope, program_id and club_id; this opens
-- up scope = 'program'.
--
-- Progress is totalled here, not in the app: an athlete can't read other
-- athletes' training, but they may see how their program is doing. To keep
-- that from exposing one person's effort, a figure is shown to anyone but the
-- program's own coaches only once at least THREE athletes have contributed,
-- and a goal is only recorded as achieved on the same condition. Dates are the
-- UTC calendar date of the bout or session.

-- --- The new measure, and what each scope may use --------------------------------

alter table goals drop constraint goals_metric_check;
alter table goals add constraint goals_metric_check
  check (metric in ('metal_hit_rate', 'precision_score', 'dryfire_minutes', 'sessions'));

-- Percentages only for the two rates; position only for the two rates.
alter table goals drop constraint goals_check1;
alter table goals add constraint goals_rate_max_check
  check (metric not in ('metal_hit_rate', 'precision_score') or target <= 100);
alter table goals drop constraint goals_check2;
alter table goals add constraint goals_rate_position_check
  check (metric in ('metal_hit_rate', 'precision_score') or position is null);
alter table goals drop constraint goals_achieved_is_real;
alter table goals add constraint goals_achieved_is_real check (
  achieved_at is null
  or (achieved_value is not null and achieved_value >= target
      and (metric not in ('metal_hit_rate', 'precision_score') or achieved_value <= 100))
);

-- An athlete's own goals stay on the personal measures; a program's goals are
-- process measures only.
alter table goals add constraint goals_measure_for_scope check (
  (scope = 'athlete' and metric in ('metal_hit_rate', 'precision_score', 'dryfire_minutes'))
  or (scope = 'program' and metric in ('dryfire_minutes', 'sessions'))
  or scope = 'club'
);

alter table goals add column created_by uuid references coaches (id) on delete set null;

-- --- Who can do what with a program goal ---------------------------------------------------
--  * coaches who manage the program (and have agreed to the coach
--    responsibilities) set, change, archive and delete them;
--  * the program's athletes read the goal itself (its measure, target, dates);
--  * a platform admin reads them, like everything else.

create policy "coaches manage their program's goals" on goals for all
  using (scope = 'program' and coach_can_manage_program(program_id) and coach_has_acknowledged(auth.uid()))
  with check (scope = 'program' and coach_can_manage_program(program_id) and coach_has_acknowledged(auth.uid())
              and created_by = auth.uid());

create policy "athletes read their program's goals" on goals for select
  using (scope = 'program' and exists (
    select 1 from athlete_memberships m where m.athlete_id = auth.uid() and m.program_id = goals.program_id
  ));

create policy "platform admin reads program goals" on goals for select
  using (scope = 'program' and platform_may_read());

-- Test goals stay in dev mode, visible to the account that made them: for a
-- program goal that's the coach who created it (it has no athlete).
alter policy "test data stays in dev mode" on goals
  using (is_test = (select in_dev_mode()) and (not is_test or athlete_id = auth.uid() or created_by = auth.uid()));

-- --- Progress -----------------------------------------------------------------------------------

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
      where id = g.id and achieved_at is null
      returning goals.achieved_at, goals.achieved_value into g.achieved_at, g.achieved_value;
  end if;

  return query select
    case when v_hidden then null else v_val end,
    v_contrib, v_hidden, g.achieved_at, g.achieved_value;
end;
$$;

revoke execute on function program_goal_progress(uuid) from public, anon;
grant execute on function program_goal_progress(uuid) to authenticated;
