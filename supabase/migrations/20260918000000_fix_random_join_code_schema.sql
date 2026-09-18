-- 545-coaching: create_club (and every other security-definer function that
-- calls random_join_code) pins search_path to just 'public' for its whole
-- execution, including nested calls — and pgcrypto lives in Supabase's
-- 'extensions' schema, not 'public'. Calling gen_random_bytes() unqualified
-- from inside random_join_code() therefore fails with "function
-- gen_random_bytes(integer) does not exist" the moment it's invoked from a
-- locked-down search_path, even though it resolves fine in an ordinary
-- session with the default search_path. Schema-qualifying the call fixes it
-- regardless of who calls this function or what their search_path is.

create or replace function random_join_code() returns text
language plpgsql
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
  raw bytea := extensions.gen_random_bytes(6);
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(raw, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;
