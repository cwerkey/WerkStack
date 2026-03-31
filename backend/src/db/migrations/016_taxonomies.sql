-- ─────────────────────────────────────────────────────────────────────────────
-- WerkStack — Migration 016: Taxonomies
-- Site-scoped taxonomy entries for VLANs, device roles, and app statuses.
-- Each entry has a category, reference ID, color, and optional icon.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS taxonomies (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organizations(id),
  site_id       UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  category      TEXT        NOT NULL CHECK (category IN ('vlan', 'device-role', 'app-status')),
  reference_id  TEXT        NOT NULL,
  color_hex     TEXT        NOT NULL DEFAULT '#888888',
  icon_slug     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxonomies_site ON taxonomies(site_id);

ALTER TABLE taxonomies ENABLE ROW LEVEL SECURITY;

CREATE POLICY taxonomy_org_isolation ON taxonomies
  USING (org_id = current_org_id() OR current_org_id() IS NULL);
