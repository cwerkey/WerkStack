-- ── Git-Sync: add auth_token and rename tracking columns ─────────────────────
ALTER TABLE git_sync_config
  ADD COLUMN IF NOT EXISTS auth_token     TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_status TEXT;
