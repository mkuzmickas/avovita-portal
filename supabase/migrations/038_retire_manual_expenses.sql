-- ─────────────────────────────────────────────────────────────────────────────
-- 038 · Retire manual expenses table; reclassify contractor as COGS
--
-- After migration 037 landed QBO sync, the manual `expenses` table is
-- obsolete — every business expense now flows through QuickBooks. Kept
-- would cause confusion (which is the real number?) and double-count.
--
-- Also flip `contractor` (FloLabs) to is_cogs = true. AvoVita is a
-- services business — mobile phlebotomy is a direct variable cost per
-- collection visit, not overhead.
-- ─────────────────────────────────────────────────────────────────────────────

drop table if exists public.expenses cascade;

update public.expense_categories
   set is_cogs = true
 where category = 'contractor';
