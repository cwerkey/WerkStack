-- 006_storage.sql — Storage: Pools, Drives, Shares (Phase 7)

-- ── Storage Pools ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_pools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES device_instances(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#4a8fc4',
  pool_type   TEXT NOT NULL CHECK (pool_type IN ('zfs', 'raid', 'ceph', 'lvm', 'drive')),
  raid_level  TEXT NOT NULL DEFAULT 'stripe',
  vdev_groups JSONB NOT NULL DEFAULT '[]',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pools_org    ON storage_pools(org_id);
CREATE INDEX IF NOT EXISTS idx_pools_site   ON storage_pools(site_id);
CREATE INDEX IF NOT EXISTS idx_pools_device ON storage_pools(device_id);

ALTER TABLE storage_pools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pools_tenant ON storage_pools;
CREATE POLICY pools_tenant ON storage_pools
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── Drives ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drives (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id),
  site_id        UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  device_id      UUID NOT NULL REFERENCES device_instances(id) ON DELETE CASCADE,
  pool_id        UUID REFERENCES storage_pools(id) ON DELETE SET NULL,
  slot_block_id  TEXT,
  label          TEXT,
  capacity       TEXT NOT NULL,
  drive_type     TEXT NOT NULL CHECK (drive_type IN ('hdd', 'ssd', 'nvme', 'flash', 'tape')),
  serial         TEXT,
  is_boot        BOOLEAN NOT NULL DEFAULT false,
  vm_passthrough TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drives_org    ON drives(org_id);
CREATE INDEX IF NOT EXISTS idx_drives_site   ON drives(site_id);
CREATE INDEX IF NOT EXISTS idx_drives_device ON drives(device_id);
CREATE INDEX IF NOT EXISTS idx_drives_pool   ON drives(pool_id);

ALTER TABLE drives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drives_tenant ON drives;
CREATE POLICY drives_tenant ON drives
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── Shares ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shares (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  pool_id    UUID REFERENCES storage_pools(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  protocol   TEXT NOT NULL CHECK (protocol IN ('smb', 'nfs', 'iscsi')),
  path       TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shares_org  ON shares(org_id);
CREATE INDEX IF NOT EXISTS idx_shares_site ON shares(site_id);
CREATE INDEX IF NOT EXISTS idx_shares_pool ON shares(pool_id);

ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shares_tenant ON shares;
CREATE POLICY shares_tenant ON shares
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);
