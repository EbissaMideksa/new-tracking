-- scripts/enable-asset-search-indexes.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Makes GET /api/assets?q=… fast on a large inventory.
--
-- The server-side search added to /api/assets uses ILIKE '%term%' on five
-- columns. A btree index cannot serve a leading-wildcard match, so without
-- these indexes every search is a sequential scan of the whole Asset table —
-- at ~1M rows that is seconds per keystroke-triggered request.
--
-- pg_trgm + GIN trigram indexes make ILIKE '%term%' index-assisted.
--
-- WHY THIS IS A SCRIPT AND NOT A PRISMA MIGRATION
--   Prisma runs each migration inside a transaction, and CREATE INDEX
--   CONCURRENTLY is illegal inside a transaction. CONCURRENTLY is used here so
--   index builds do NOT block writes on the live table — the alternative would
--   hold a SHARE lock for the duration of five GIN builds.
--
-- RUN IT WITH:  make asset-search-indexes
--   (idempotent — IF NOT EXISTS throughout; safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Asset_tagNumber_trgm_idx"
  ON "Asset" USING gin ("tagNumber" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Asset_serialNumber_trgm_idx"
  ON "Asset" USING gin ("serialNumber" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Asset_itemCode_trgm_idx"
  ON "Asset" USING gin ("itemCode" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Asset_assetDescription_trgm_idx"
  ON "Asset" USING gin ("assetDescription" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Asset_itemCodeDescription_trgm_idx"
  ON "Asset" USING gin ("itemCodeDescription" gin_trgm_ops);

-- Report what exists now so the operator can confirm.
SELECT indexname
  FROM pg_indexes
 WHERE tablename = 'Asset' AND indexname LIKE 'Asset_%_trgm_idx'
 ORDER BY indexname;
