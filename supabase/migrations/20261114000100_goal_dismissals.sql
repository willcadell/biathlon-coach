-- 545-coaching: an athlete can archive a program goal from their own page.
--
-- A program goal belongs to the program, and archiving it (goals.archived_at) is the coaches' call
-- and hides it for everyone. An athlete who just wants an ended one off their own page needs a
-- private switch instead: one row here per athlete and goal, readable and writable only by that
-- athlete. Nothing about the goal itself, its progress or anyone else's page changes.

create table goal_dismissals (
  goal_id uuid not null references goals (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (goal_id, athlete_id)
);

alter table goal_dismissals enable row level security;

-- Only your own rows, and only for a program goal you can already see (the subquery runs under
-- the goals policies, so it cannot be used to probe goals in programs you are not in).
create policy "athlete reads own dismissals" on goal_dismissals for select
  using (athlete_id = auth.uid());

create policy "athlete dismisses visible program goals" on goal_dismissals for insert
  with check (
    athlete_id = auth.uid()
    and exists (select 1 from goals g where g.id = goal_id and g.scope = 'program')
  );

create policy "athlete restores own dismissals" on goal_dismissals for delete
  using (athlete_id = auth.uid());
