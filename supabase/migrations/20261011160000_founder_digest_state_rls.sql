-- Same second wall as the other private tables (rate_limit_salt,
-- rate_limit_hits): API privileges are already revoked; RLS without policies
-- keeps the table closed even if a grant slips in later. The digest job runs
-- as the table owner and is unaffected.
alter table private.founder_digest_state enable row level security;
