-- 545-coaching: anonymous target contributions, to improve automatic hole detection.
--
-- An athlete can choose, one scored target at a time, to contribute it. What
-- arrives is deliberately not linked to anyone: a reduced photo (re-encoded in the
-- browser, so camera and location metadata is gone), the confirmed hole positions,
-- and the calibration needed to place them on the photo. No account, name, club,
-- workout, notes, or timestamp — only the month.
--
-- Because nothing here identifies the contributor, a submission can't be found or
-- withdrawn later; the app says so before it is sent.
--
-- The table has RLS on and no policies, and no client grants: it can only be read
-- from the Supabase SQL editor or CLI, by the operator. Test data (dev mode) is
-- never accepted.

create table training_targets (
  id uuid primary key default gen_random_uuid(),
  photo bytea not null,
  -- Only to drop an accidental double submit of the same photo.
  photo_sha256 text not null unique,
  target_face_id text not null,
  bullet_diameter_mm numeric not null,
  mm_per_unit numeric not null,
  position text not null check (position in ('prone', 'standing')),
  expected_shots int,
  -- [{"x": mm, "y": mm}, ...] from the aiming centre; firing order is not kept.
  shots jsonb not null,
  -- The first of the month, not a timestamp, so a submission can't be lined up
  -- with a particular session.
  submitted_month date not null default date_trunc('month', now())::date
);
alter table training_targets enable row level security;
revoke all on training_targets from anon, authenticated;

create or replace function submit_training_target(
  p_photo_base64 text,
  p_target_face_id text,
  p_bullet_diameter_mm numeric,
  p_mm_per_unit numeric,
  p_position text,
  p_expected_shots int,
  p_shots jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo bytea;
begin
  -- An account is required to submit (it keeps this from being an open upload),
  -- but nothing about it is stored.
  if auth.uid() is null then
    raise exception 'Sign in to contribute';
  end if;
  if in_dev_mode() then
    raise exception 'Test data is never contributed';
  end if;

  if length(p_photo_base64) > 1500000 then
    raise exception 'That photo is too large';
  end if;
  if p_position not in ('prone', 'standing') then
    raise exception 'Unknown position';
  end if;
  if length(p_target_face_id) > 40 then
    raise exception 'Unknown target';
  end if;
  if p_bullet_diameter_mm is null or p_bullet_diameter_mm <= 0 or p_bullet_diameter_mm > 30
     or p_mm_per_unit is null or p_mm_per_unit <= 0 then
    raise exception 'Invalid calibration';
  end if;
  if p_shots is null or jsonb_typeof(p_shots) <> 'array'
     or jsonb_array_length(p_shots) not between 1 and 12 then
    raise exception 'Invalid shots';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_shots) e
    where jsonb_typeof(e -> 'x') <> 'number' or jsonb_typeof(e -> 'y') <> 'number'
       or abs((e ->> 'x')::numeric) > 1000 or abs((e ->> 'y')::numeric) > 1000
  ) then
    raise exception 'Invalid shots';
  end if;

  v_photo := decode(p_photo_base64, 'base64');
  if length(v_photo) < 1000 then
    raise exception 'That does not look like a photo';
  end if;

  insert into training_targets (
    photo, photo_sha256, target_face_id, bullet_diameter_mm, mm_per_unit, position, expected_shots, shots
  ) values (
    v_photo, encode(sha256(v_photo), 'hex'), p_target_face_id, p_bullet_diameter_mm, p_mm_per_unit,
    p_position, p_expected_shots,
    (select jsonb_agg(jsonb_build_object('x', e -> 'x', 'y', e -> 'y')) from jsonb_array_elements(p_shots) e)
  )
  on conflict (photo_sha256) do nothing;

  return found;
end;
$$;
revoke execute on function submit_training_target(text, text, numeric, numeric, text, int, jsonb) from public, anon;
grant execute on function submit_training_target(text, text, numeric, numeric, text, int, jsonb) to authenticated;
