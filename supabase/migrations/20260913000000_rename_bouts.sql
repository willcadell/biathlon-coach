-- 545-coaching: rename `bouts` to `precision_bouts`.
--
-- "Bouts" on its own read ambiguously once metal_bouts existed alongside it.
-- Postgres carries indexes, policies and the foreign key from workouts over
-- automatically on a plain rename. Guarded with an existence check because
-- the table was already renamed by hand in the dashboard before this
-- migration was written — this just catches the policy names up and stays
-- a safe no-op if run again or run against a project where the manual
-- rename never happened.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bouts') then
    execute 'alter table bouts rename to precision_bouts';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'precision_bouts' and policyname = 'athlete manages own bouts') then
    execute 'alter policy "athlete manages own bouts" on precision_bouts rename to "athlete manages own precision bouts"';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'precision_bouts' and policyname = 'coach reads linked bouts') then
    execute 'alter policy "coach reads linked bouts" on precision_bouts rename to "coach reads linked precision bouts"';
  end if;
end $$;
