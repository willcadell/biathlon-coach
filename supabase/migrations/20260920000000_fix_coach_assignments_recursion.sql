-- 545-coaching: "coach reads co-coaches in same club" queries
-- coach_assignments from inside its own policy on coach_assignments — a
-- self-reference that makes Postgres re-apply the very policy being
-- evaluated, which it detects and refuses to run:
--   ERROR: 42P17: infinite recursion detected in policy for relation
--   "coach_assignments"
-- The fix is the same one already used for is_coach_of: move the check into
-- a security-definer function. That function's internal query runs with the
-- owning role's privileges, which bypass RLS instead of re-triggering it.

create or replace function shares_club_with(p_coach_id uuid, p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from coach_assignments
    where coach_assignments.coach_id = p_coach_id and coach_assignments.club_id = p_club_id
  );
$$;

drop policy "coach reads co-coaches in same club" on coach_assignments;
create policy "coach reads co-coaches in same club" on coach_assignments for select using (
  shares_club_with(auth.uid(), coach_assignments.club_id)
);
