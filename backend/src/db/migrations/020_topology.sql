-- Phase 8A: Physical Topology support

-- Add switch_role and is_gateway to device_instances
ALTER TABLE device_instances ADD COLUMN IF NOT EXISTS switch_role TEXT DEFAULT 'unclassified'
  CHECK (switch_role IN ('core', 'edge', 'access', 'unclassified'));
ALTER TABLE device_instances ADD COLUMN IF NOT EXISTS is_gateway BOOLEAN DEFAULT false;

-- Topology positions table (saved node positions for pinned nodes)
CREATE TABLE IF NOT EXISTS topology_positions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  device_id  UUID NOT NULL REFERENCES device_instances(id) ON DELETE CASCADE,
  x          DOUBLE PRECISION NOT NULL,
  y          DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_topo_pos_site ON topology_positions(site_id);

ALTER TABLE topology_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS topo_pos_tenant ON topology_positions;
CREATE POLICY topo_pos_tenant ON topology_positions
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- VLANs table (site-scoped, references subnets)
CREATE TABLE IF NOT EXISTS vlans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  vlan_id    INTEGER NOT NULL CHECK (vlan_id >= 1 AND vlan_id <= 4094),
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#888888',
  subnet_id  UUID REFERENCES subnets(id) ON DELETE SET NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, vlan_id)
);

CREATE INDEX IF NOT EXISTS idx_vlans_site ON vlans(site_id);

ALTER TABLE vlans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vlans_tenant ON vlans;
CREATE POLICY vlans_tenant ON vlans
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);
