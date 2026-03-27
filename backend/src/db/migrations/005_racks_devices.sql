-- 005_racks_devices.sql — Racks and Device Instances (Phase 6)

-- ── Racks ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS racks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  zone_id     UUID REFERENCES zones(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  u_height    INTEGER NOT NULL DEFAULT 42,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_racks_org    ON racks(org_id);
CREATE INDEX IF NOT EXISTS idx_racks_site   ON racks(site_id);
CREATE INDEX IF NOT EXISTS idx_racks_zone   ON racks(zone_id);

ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS racks_tenant ON racks;
CREATE POLICY racks_tenant ON racks
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── Device Instances ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_instances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  zone_id       UUID REFERENCES zones(id) ON DELETE SET NULL,
  rack_id       UUID REFERENCES racks(id) ON DELETE SET NULL,
  template_id   UUID REFERENCES device_templates(id) ON DELETE SET NULL,
  type_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  rack_u        INTEGER,
  u_height      INTEGER,
  face          TEXT DEFAULT 'front' CHECK (face IN ('front', 'rear')),
  ip            TEXT,
  serial        TEXT,
  asset_tag     TEXT,
  notes         TEXT,
  is_draft      BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_org      ON device_instances(org_id);
CREATE INDEX IF NOT EXISTS idx_devices_site     ON device_instances(site_id);
CREATE INDEX IF NOT EXISTS idx_devices_rack     ON device_instances(rack_id);
CREATE INDEX IF NOT EXISTS idx_devices_template ON device_instances(template_id);

ALTER TABLE device_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS devices_tenant ON device_instances;
CREATE POLICY devices_tenant ON device_instances
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);
