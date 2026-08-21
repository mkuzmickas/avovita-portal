-- ─────────────────────────────────────────────────────────────────────────────
-- 041 · Portal test → Mayo SKU mapping (multi-value, for panels)
--
-- The existing `tests.mayo_test_id` column is single-valued and works
-- for tests that map 1:1 to a Mayo SKU (CRMP1, LIVPR, CMAMA, etc.).
-- But AvoVita sells its own multi-code panels — MENS_HORMONE_PANEL,
-- WOMENS_HORMONE_PANEL, THYROID_FUNCTION_PANEL, FATIGUE, etc. — that
-- decompose into a dozen individual Mayo tests each. The invoice
-- matcher's fuzzy name overlap can't bridge "Men's Hormone Panel" to
-- "Androstenedione, Serum" — it needs the explicit code list.
--
-- New column `mayo_test_ids TEXT[]` holds zero-to-many Mayo codes.
-- Matcher reads BOTH columns:
--   effective_ids = coalesce(nullif(mayo_test_ids, '{}'), array[mayo_test_id])
--
-- A direct code hit in effective_ids scores higher (+15) than a fuzzy
-- name match (+12) because it's deterministic.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tests
  add column if not exists mayo_test_ids text[] not null default '{}';

comment on column public.tests.mayo_test_ids is
  'Zero-to-many Mayo Clinic test IDs this portal test bills as. Used by the Mayo invoice matcher for exact SKU-to-SKU matching. Panels populate the full component list; single-code tests can leave this empty and use the singular mayo_test_id.';

-- Seed the panel mappings Mike provided.
-- Skip silently if a panel doesn't exist on this deployment (dev
-- environments may have a different test catalogue).
update public.tests set mayo_test_ids = '{KS,NAS,CL,BUN,CRTS1,CA,GLURA}'
  where sku = 'BASIC_METABOLIC_PANEL';

-- Comprehensive metabolic = basic metabolic + LIVPR bundle (which
-- Mayo bills as its own LIVPR code containing AST/ALP/ALT/bilirubin/
-- protein/albumin). Listing LIVPR here lets the matcher score a hit
-- when Mayo bills LIVPR on the same accession.
update public.tests set mayo_test_ids = '{KS,NAS,CL,BUN,CRTS1,CA,GLURA,LIVPR}'
  where sku = 'COMPREHENSIVE_METABOLIC_PANEL';

update public.tests set mayo_test_ids =
    '{CORT,DHEA_,EEST,FSH,INS,LH,PRL,PGSN,SHBG1,TTST,STSH,T4FT4}'
  where sku = 'WOMENS_HORMONE_PANEL';

update public.tests set mayo_test_ids =
    '{ANST,CORT,DHEA_,DHTS,EEST,FSH,HGH,LH,PSAFT,SHBG1,STSH,TTST}'
  where sku = 'MENS_HORMONE_PANEL';

update public.tests set mayo_test_ids = '{FRT3S,STSH,T3,T3FR,T4FT4,TAB}'
  where sku = 'THYROID_FUNCTION_PANEL';

update public.tests set mayo_test_ids =
    '{FERR1,IOD,SFEC,MGS,SEWB,25HDN,FB12,ZN_S}'
  where sku = 'VITAMINS_MINERALS_ESSENTIAL';

update public.tests set mayo_test_ids =
    '{CRS,CUS1,SFEC,MGS,SEWB,VITAE,TDP,VITB2,VITB3,FPAB,B6PRO,FBIOT,FB12,25HDN,VITK1,ZN_S}'
  where sku = 'VITAMINS_MINERALS_ADVANCED';

update public.tests set mayo_test_ids = '{25HDN,FERR1,FB12}'
  where sku = 'FATIGUE';
