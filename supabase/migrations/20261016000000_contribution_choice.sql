-- 545-coaching: the athlete's choice about contributing targets anonymously.
--
-- Asked once, when an athlete first signs in (and once for existing athletes),
-- and changeable at any time in Settings. null means "not asked yet". The choice
-- is the athlete's alone: no coach, club or personal coach can read it, which is
-- why it lives in its own table rather than on the athletes row that coaches see.
--
-- Turning it on applies to targets scored from then on (contribute_since). The
-- contributions themselves stay anonymous (see training_targets), so turning it
-- off stops future ones but can't withdraw earlier ones.

create table athlete_preferences (
  athlete_id uuid primary key references athletes (id) on delete cascade,
  contribute_targets boolean,
  -- When they said yes; only targets shot after this are contributed.
  contribute_since timestamptz
);
alter table athlete_preferences enable row level security;
create policy "athlete reads own preferences" on athlete_preferences for select using (athlete_id = auth.uid());
create policy "athlete creates own preferences" on athlete_preferences for insert with check (athlete_id = auth.uid());
create policy "athlete updates own preferences" on athlete_preferences for update using (athlete_id = auth.uid());

-- The server enforces the choice too, not only the app: a submission from
-- anyone who hasn't said yes is refused. Only the check reads the choice; the
-- stored submission still carries nothing about who sent it.
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
