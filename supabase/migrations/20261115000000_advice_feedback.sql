-- 545-coaching: athletes answer the shooting advice, and the answers shape it.
--
-- One row per answer, kept as a log: "sounds like me" / "not me" (with the cause the
-- athlete picked instead) on a finding, the result of a check they ran, or whether a
-- drill helped. The app reads the whole log and lets the latest answers win, so a
-- change of mind is a new row, never an edit. See docs/athlete-feedback/DESIGN.md.
--
-- The athlete writes and reads their own. Linked coaches read them (they see the
-- athlete's view of the advice) but never write: the athlete's answer is theirs.

create table advice_feedback (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null default auth.uid() references athletes (id) on delete cascade,
  kind text not null check (kind in ('finding', 'drill')),
  ref text not null,
  position text check (position in ('prone', 'standing', 'both')),
  verdict text not null check (verdict in ('agree', 'not-me', 'check', 'helped', 'not-helped', 'not-tried')),
  detail text,
  confidence real,
  created_at timestamptz not null default now()
);

create index advice_feedback_athlete on advice_feedback (athlete_id, created_at);

alter table advice_feedback enable row level security;

create policy "athlete reads own advice feedback" on advice_feedback for select
  using (athlete_id = auth.uid());

create policy "athlete adds own advice feedback" on advice_feedback for insert
  with check (athlete_id = auth.uid());

create policy "coach reads linked athletes' advice feedback" on advice_feedback for select
  using (is_coach_of(auth.uid(), athlete_id));
