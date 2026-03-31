-- 017_storage_fields.sql — Add model to drives, access fields to shares, health to pools

-- ── Drives: add model field ──────────────────────────────────────────────────
ALTER TABLE drives ADD COLUMN IF NOT EXISTS model TEXT;

-- ── Shares: add access control fields ────────────────────────────────────────
-- access_mode: 'public' (anyone), 'auth' (authenticated users), 'list' (specific users/groups)
ALTER TABLE shares ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'public'
  CHECK (access_mode IN ('public', 'auth', 'list'));
-- access_list: JSON array of user/group names when access_mode = 'list'
ALTER TABLE shares ADD COLUMN IF NOT EXISTS access_list JSONB NOT NULL DEFAULT '[]';

-- ── Storage Pools: add health status ─────────────────────────────────────────
-- health: 'online', 'degraded', 'faulted', 'offline', 'unknown'
ALTER TABLE storage_pools ADD COLUMN IF NOT EXISTS health TEXT NOT NULL DEFAULT 'unknown'
  CHECK (health IN ('online', 'degraded', 'faulted', 'offline', 'unknown'));
