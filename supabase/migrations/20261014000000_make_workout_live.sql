-- 545-coaching: promote a test workout to live data.
--
-- In dev mode a developer can decide a test workout was worth keeping, and turn
-- it into a real one: it, its bouts and its click log leave dev mode together and
-- become visible to the athlete's coaches and shareable to the club like any other
-- workout. (Feed posts and coach notes made about it stay test data — share it
-- again once it's live.) The only way a row's test tag ever changes.

create or replace function stamp_test_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.is_test := in_dev_mode();
  elsif auth.uid() is not null and coalesce(current_setting('app.allow_promote', true), '') <> '1' then
    new.is_test := old.is_test;
  end if;
  return new;
end;
$$;

create or replace function make_workout_live(p_workout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not in_dev_mode() then
    raise exception 'Only from dev mode';
  end if;
  if not exists (
    select 1 from workouts where id = p_workout_id and athlete_id = auth.uid() and is_test
  ) then
    raise exception 'That isn''t one of your test workouts';
  end if;

  -- Transaction-local, and not settable from a client request.
  perform set_config('app.allow_promote', '1', true);
  update workouts          set is_test = false where id = p_workout_id;
  update precision_bouts   set is_test = false where workout_id = p_workout_id;
  update metal_bouts       set is_test = false where workout_id = p_workout_id;
  update click_adjustments set is_test = false where workout_id = p_workout_id;
  perform set_config('app.allow_promote', '0', true);
end;
$$;
grant execute on function make_workout_live(uuid) to authenticated;
