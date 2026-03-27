-- 011_phase12.sql — Polish & Hardening (Phase 12)

-- ── Power budget on racks ─────────────────────────────────────────────────────
-- Optional PDU/circuit capacity; NULL = no limit configured
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'racks' AND column_name = 'power_budget_watts'
  ) THEN
    ALTER TABLE racks ADD COLUMN power_budget_watts INTEGER CHECK (power_budget_watts > 0);
  END IF;
END $$;

-- ── Audit Log ────────────────────────────────────────────────────────────────
-- Broad event trail beyond device_events: config changes, user actions, etc.
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id     UUID        REFERENCES sites(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      TEXT        NOT NULL,   -- e.g. 'rack.create', 'device.update', 'user.login'
  resource    TEXT,                   -- e.g. 'rack', 'device', 'template'
  resource_id TEXT,                   -- UUID or other identifier of the affected entity
  details     JSONB,                  -- before/after state or extra context
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org     ON audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_site    ON audit_log(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_time    ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_tenant ON audit_log;
CREATE POLICY audit_log_tenant ON audit_log
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);
