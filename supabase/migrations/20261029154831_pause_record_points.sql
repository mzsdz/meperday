-- Reversible pause. Preserve balances, ledger rows, and seen IDs.
-- Re-enabling later must baseline records created during the pause first.
alter table public.meday_journals disable trigger meday_award_record_points;
