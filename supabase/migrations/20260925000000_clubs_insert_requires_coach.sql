-- 545-coaching: only a registered coach may create a club.
--
-- create_club() already checks this in its own application logic, but
-- that check runs inside a security-definer function and so bypasses RLS
-- entirely — it protects the RPC path, not the table. The plain "coach
-- creates a club" policy below only ever checked created_by = auth.uid(),
-- not that auth.uid() was actually a coach, leaving a direct insert (one
-- that skips the RPC) able to create a club as any authenticated user.

drop policy "coach creates a club" on clubs;

create policy "coach creates a club" on clubs for insert with check (
  created_by = auth.uid()
  and exists (select 1 from coaches where coaches.id = auth.uid())
);
