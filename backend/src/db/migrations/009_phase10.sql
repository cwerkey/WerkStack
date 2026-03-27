-- 009_phase10.sql — Tickets and Guides (Phase 10)

-- ── Tickets ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'in-progress', 'closed')),
  priority    TEXT        NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  category_id TEXT        REFERENCES ticket_categories(id) ON DELETE SET NULL,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_org  ON tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_tickets_site ON tickets(org_id, site_id);

-- ── Guides ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guides (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '',
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guides_org  ON guides(org_id);
CREATE INDEX IF NOT EXISTS idx_guides_site ON guides(org_id, site_id);
