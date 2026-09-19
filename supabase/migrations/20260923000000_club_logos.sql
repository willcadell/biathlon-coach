-- 545-coaching: club logos — a club's own branding, shown wherever the
-- club itself is, not just its name.
--
-- Public bucket: a logo isn't private the way an athlete's target photo is,
-- so the app can use a plain URL instead of a signed one that needs
-- refreshing on every view.

alter table clubs add column if not exists logo_path text;

insert into storage.buckets (id, name, public)
values ('club-logos', 'club-logos', true)
on conflict (id) do nothing;

-- Path convention: <club_id>/logo.jpg. Only the club's admin coach may
-- write it — checked against coach_assignments the same way every other
-- admin-only action in this schema is.
create policy "club admin manages own club's logo file"
on storage.objects for all
using (
  bucket_id = 'club-logos'
  and exists (
    select 1 from coach_assignments
    where coach_assignments.club_id::text = (storage.foldername(name))[1]
      and coach_assignments.coach_id = auth.uid()
      and coach_assignments.is_admin
  )
)
with check (
  bucket_id = 'club-logos'
  and exists (
    select 1 from coach_assignments
    where coach_assignments.club_id::text = (storage.foldername(name))[1]
      and coach_assignments.coach_id = auth.uid()
      and coach_assignments.is_admin
  )
);

create policy "club admin sets own club's logo path"
on clubs for update
using (
  exists (
    select 1 from coach_assignments
    where coach_assignments.club_id = clubs.id
      and coach_assignments.coach_id = auth.uid()
      and coach_assignments.is_admin
  )
)
with check (
  exists (
    select 1 from coach_assignments
    where coach_assignments.club_id = clubs.id
      and coach_assignments.coach_id = auth.uid()
      and coach_assignments.is_admin
  )
);
