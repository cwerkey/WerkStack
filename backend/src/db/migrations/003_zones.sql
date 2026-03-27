-- ─────────────────────────────────────────────────────────────────────────────
-- WerkStack — Migration 003: Zones
-- Each site is subdivided into zones (server room, closet, office, etc.).
-- Zones are the parent container for racks and non-racked devices.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id     UUID        NOT NULL REFERENCES sites(id)         ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zones_org_id_idx  ON zones (org_id);
CREATE INDEX IF NOT EXISTS zones_site_id_idx ON zones (site_id);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY zones_tenant ON zones
  USING (org_id = current_org_id() OR current_org_id() IS NULL);
