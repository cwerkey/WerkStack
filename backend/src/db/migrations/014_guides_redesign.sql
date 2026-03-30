-- 014_guides_redesign.sql — Guide manuals hierarchy, versioning, entity linking

-- ── Guide Manuals ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guide_manuals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guide_manuals_site ON guide_manuals(org_id, site_id);

-- ── Alter guides table ────────────────────────────────────────────────────────
ALTER TABLE guides ADD COLUMN IF NOT EXISTS manual_id  UUID REFERENCES guide_manuals(id) ON DELETE SET NULL;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS sort_order INT  NOT NULL DEFAULT 0;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS is_locked  BOOLEAN NOT NULL DEFAULT false;

-- ── Guide Versions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guide_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guide_id    UUID        NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  edited_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guide_versions_guide ON guide_versions(guide_id, created_at DESC);

-- ── Guide Links ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guide_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guide_id    UUID        NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  entity_type TEXT        NOT NULL CHECK (entity_type IN (
    'device', 'pool', 'share', 'subnet', 'host', 'vm', 'app'
  )),
  entity_id   UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guide_links_unique ON guide_links(guide_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_guide_links_entity ON guide_links(org_id, entity_type, entity_id);
