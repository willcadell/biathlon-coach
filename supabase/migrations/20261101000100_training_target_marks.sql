-- 545-coaching: contributed targets carry where the holes are in the photo, and
-- a content fingerprint so the same target isn't kept twice.
--
-- marks: the athlete-confirmed aiming-circle fit and hole positions in the
--   photo, as fractions of the image: exact labels for training a detector,
--   instead of re-finding the circle afterwards. Geometry only; nothing in it
--   says whose it is. Rebuilt here from validated numbers, never stored as sent.
-- shots_fingerprint: a hash of the confirmed shots and the scale, rounded. The
--   same target was being contributed twice as differently-encoded photos, which
--   the photo hash can't see. The fingerprint is of the marks, not of the
--   athlete, so it doesn't link a submission to anyone.

alter table training_targets add column marks jsonb;
alter table training_targets add column shots_fingerprint text;

-- Existing rows, by the same recipe the function uses.
update training_targets t set shots_fingerprint = md5(
  coalesce((
    select string_agg(round((e ->> 'x')::numeric, 1)::text || ',' || round((e ->> 'y')::numeric, 1)::text, '|'
              order by round((e ->> 'x')::numeric, 1), round((e ->> 'y')::numeric, 1))
    from jsonb_array_elements(t.shots) e
  ), '') || '#' || round(t.mm_per_unit, 1)::text
);
create index training_targets_fingerprint on training_targets (shots_fingerprint);

drop function if exists submit_training_target(text, text, numeric, numeric, text, int, jsonb);

create or replace function submit_training_target(
  p_photo_base64 text,
  p_target_face_id text,
  p_bullet_diameter_mm numeric,
  p_mm_per_unit numeric,
  p_position text,
  p_expected_shots int,
  p_shots jsonb,
  p_marks jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo bytea;
  v_fp text;
  v_marks jsonb := null;
begin
  if auth.uid() is null then
    raise exception 'Sign in to contribute';
  end if;
  if in_dev_mode() then
    raise exception 'Test data is never contributed';
  end if;
  if not coalesce(
    (select contribute_targets from athlete_preferences where athlete_id = auth.uid()), false
  ) then
    raise exception 'Turn on contributing in Settings first';
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

  -- The marks are optional (older scored targets don't have them), but when
  -- present they're checked, and rebuilt from the numbers only.
  if p_marks is not null then
    if jsonb_typeof(p_marks) <> 'object' or jsonb_typeof(p_marks -> 'bulls') <> 'array'
       or jsonb_array_length(p_marks -> 'bulls') not between 1 and 6 then
      raise exception 'Invalid marks';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_marks -> 'bulls') b
      where jsonb_typeof(b -> 'cx') <> 'number' or jsonb_typeof(b -> 'cy') <> 'number'
         or jsonb_typeof(b -> 'a') <> 'number' or jsonb_typeof(b -> 'b') <> 'number'
         or jsonb_typeof(b -> 'rot') <> 'number' or jsonb_typeof(b -> 'holes') <> 'array'
         or (b ->> 'cx')::numeric not between 0 and 1 or (b ->> 'cy')::numeric not between 0 and 3
         or (b ->> 'a')::numeric not between 0.0001 and 1 or (b ->> 'b')::numeric not between 0.0001 and 1
         or (b ->> 'rot')::numeric not between -360 and 360
         or jsonb_array_length(b -> 'holes') > 12
    ) or exists (
      select 1 from jsonb_array_elements(p_marks -> 'bulls') b, jsonb_array_elements(b -> 'holes') h
      where jsonb_typeof(h -> 'x') <> 'number' or jsonb_typeof(h -> 'y') <> 'number'
         or (h ->> 'x')::numeric not between 0 and 1 or (h ->> 'y')::numeric not between 0 and 3
    ) then
      raise exception 'Invalid marks';
    end if;
    v_marks := jsonb_build_object('bulls', (
      select jsonb_agg(jsonb_build_object(
        'cx', b -> 'cx', 'cy', b -> 'cy', 'a', b -> 'a', 'b', b -> 'b', 'rot', b -> 'rot',
        'holes', (select coalesce(jsonb_agg(jsonb_build_object('x', h -> 'x', 'y', h -> 'y')), '[]'::jsonb)
                  from jsonb_array_elements(b -> 'holes') h)
      )) from jsonb_array_elements(p_marks -> 'bulls') b
    ));
  end if;

  v_photo := decode(p_photo_base64, 'base64');
  if length(v_photo) < 1000 then
    raise exception 'That does not look like a photo';
  end if;

  v_fp := md5(
    coalesce((
      select string_agg(round((e ->> 'x')::numeric, 1)::text || ',' || round((e ->> 'y')::numeric, 1)::text, '|'
                order by round((e ->> 'x')::numeric, 1), round((e ->> 'y')::numeric, 1))
      from jsonb_array_elements(p_shots) e
    ), '') || '#' || round(p_mm_per_unit, 1)::text
  );
  -- Already have this target (possibly as a differently-encoded photo).
  if exists (select 1 from training_targets where shots_fingerprint = v_fp) then
    return false;
  end if;

  insert into training_targets (
    photo, photo_sha256, target_face_id, bullet_diameter_mm, mm_per_unit, position, expected_shots, shots,
    marks, shots_fingerprint
  ) values (
    v_photo, encode(sha256(v_photo), 'hex'), p_target_face_id, p_bullet_diameter_mm, p_mm_per_unit,
    p_position, p_expected_shots,
    (select jsonb_agg(jsonb_build_object('x', e -> 'x', 'y', e -> 'y')) from jsonb_array_elements(p_shots) e),
    v_marks, v_fp
  )
  on conflict (photo_sha256) do nothing;

  return found;
end;
$$;

revoke execute on function submit_training_target(text, text, numeric, numeric, text, int, jsonb, jsonb) from public, anon;
grant execute on function submit_training_target(text, text, numeric, numeric, text, int, jsonb, jsonb) to authenticated;
