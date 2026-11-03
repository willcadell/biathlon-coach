-- 545-coaching: workout templates.
--
-- A finished range workout can be saved as a template: the order of its bouts,
-- each a kind (precision or metal) and a position. Starting a session from one
-- walks the athlete through those steps. The National Team test is the built-in
-- template and lives in the app, not here.
--
-- One row per saved template; the steps are a JSON array on the row, only ever read
-- with it. Templates are the athlete's own and are not shown to coaches. Dev mode
-- keeps test templates apart exactly as it does for bouts.
--
-- A workout that follows a template carries a copy of it (name and steps), so
-- renaming or deleting the saved template later cannot change a session already shot.

create table workout_templates (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 40),
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create index workout_templates_athlete_idx on workout_templates (athlete_id, created_at desc);

alter table workout_templates enable row level security;

create policy "athlete manages own templates" on workout_templates for all
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());

create trigger stamp_test_row before insert or update on workout_templates
  for each row execute function stamp_test_row();

create policy "test data stays in dev mode" on workout_templates as restrictive for select
  using (is_test = (select in_dev_mode()) and (not is_test or athlete_id = auth.uid()));

alter table workouts add column template jsonb
  check (template is null or (jsonb_typeof(template) = 'object' and jsonb_typeof(template -> 'steps') = 'array'));
