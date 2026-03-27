-- ─────────────────────────────────────────────────────────────────────────────
-- WerkStack — Migration 008: Cable Map & IP Plan
-- connections, subnets, ip_assignments
-- ─────────────────────────────────────────────────────────────────────────────

-- ── connections ──────────────────────────────────────────────────────────────
-- Physical cable connections between device ports within a site.
-- src_block_type / dst_block_type stored for fast medium-mismatch detection.
-- cable_type_id is TEXT (not FK UUID) because builtin cable types use slug IDs.

CREATE TABLE IF NOT EXISTS connections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id),
  site_id         UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  src_device_id   UUID        NOT NULL REFERENCES device_instances(id) ON DELETE CASCADE,
  src_port        TEXT,
  src_block_id    TEXT,
  src_block_type  TEXT,
  dst_device_id   UUID        NOT NULL REFERENCES device_instances(id) ON DELETE CASCADE,
  dst_port        TEXT,
  dst_block_id    TEXT,
  dst_block_type  TEXT,
  cable_type_id   TEXT,
  label           TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connections_site_idx ON connections (site_id);
CREATE INDEX IF NOT EXISTS connections_src_idx  ON connections (src_device_id);
CREATE INDEX IF NOT EXISTS connections_dst_idx  ON connections (dst_device_id);

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY connections_org ON connections
  USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- ── subnets ───────────────────────────────────────────────────────────────────
-- IP subnet definitions per site.

CREATE TABLE IF NOT EXISTS subnets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  cidr        TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  vlan        INTEGER,
  gateway     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subnets_site_idx ON subnets (site_id);

ALTER TABLE subnets ENABLE ROW LEVEL SECURITY;

CREATE POLICY subnets_org ON subnets
  USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- ── ip_assignments ────────────────────────────────────────────────────────────
-- IP address assignments within a subnet.
-- UNIQUE (org_id, subnet_id, ip) enforces collision prevention.
-- device_id is nullable — allows reserving an IP without assigning it.

CREATE TABLE IF NOT EXISTS ip_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  subnet_id   UUID        NOT NULL REFERENCES subnets(id) ON DELETE CASCADE,
  ip          TEXT        NOT NULL,
  device_id   UUID        REFERENCES device_instances(id) ON DELETE SET NULL,
  label       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, subnet_id, ip)
);

CREATE INDEX IF NOT EXISTS ip_assignments_subnet_idx ON ip_assignments (subnet_id);
CREATE INDEX IF NOT EXISTS ip_assignments_device_idx ON ip_assignments (device_id);

ALTER TABLE ip_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ip_assignments_org ON ip_assignments
  USING (org_id = current_org_id() OR current_org_id() IS NULL);
