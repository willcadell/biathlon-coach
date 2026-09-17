-- 545-coaching: photo storage.
--
-- One bucket for every athlete's target photos. Private, not a public
-- bucket with an unguessable URL — the storage.objects policy below is what
-- actually protects a photo, the same as every other table in this app, so
-- deleting a bout's row can't leave its photo reachable by anyone who kept
-- the link. The app fetches a short-lived signed URL per view instead.
--
-- Path convention: <athlete_id>/<bout_id>.jpg (full image) and
-- <athlete_id>/<bout_id>-thumb.jpg (list thumbnail) — the policy checks the
-- leading folder against auth.uid(), the same ownership test as elsewhere.

insert into storage.buckets (id, name, public)
values ('target-photos', 'target-photos', false)
on conflict (id) do nothing;

create policy "athlete manages own bout photos"
on storage.objects for all
using (bucket_id = 'target-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'target-photos' and (storage.foldername(name))[1] = auth.uid()::text);
