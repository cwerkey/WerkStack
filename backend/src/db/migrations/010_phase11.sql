-- 010_phase11.sql — Pathfinder & Advanced Features (Phase 11)

-- ── VPN Tunnels (L3 logical links for Pathfinder) ───────────────────────────
CREATE TABLE IF NOT EXISTS vpn_tunnels (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id         UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  src_device_id   UUID        NOT NULL REFERENCES device_instances(id) ON DELETE CASCADE,
  dst_device_id   UUID        NOT NULL REFERENCES device_instances(id) ON DELETE CASCADE,
  tunnel_type     TEXT        NOT NULL DEFAULT 'vpn'
                              CHECK (tunnel_type IN ('vpn', 'vxlan', 'gre', 'ipsec', 'wireguard')),
  label           TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vpn_tunnels_site ON vpn_tunnels(site_id);
CREATE INDEX IF NOT EXISTS idx_vpn_tunnels_src  ON vpn_tunnels(src_device_id);
CREATE INDEX IF NOT EXISTS idx_vpn_tunnels_dst  ON vpn_tunnels(dst_device_id);

ALTER TABLE vpn_tunnels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vpn_tunnels_tenant ON vpn_tunnels;
CREATE POLICY vpn_tunnels_tenant ON vpn_tunnels
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── Resource Ledger (loose components inventory) ────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'misc'
                          CHECK (category IN ('ram', 'cpu', 'drive', 'cable', 'psu', 'fan', 'pcie-card', 'misc')),
  sku         TEXT,
  quantity    INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved    INTEGER     NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  unit_cost   NUMERIC(12,2),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_items_site ON ledger_items(org_id, site_id);

ALTER TABLE ledger_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ledger_items_tenant ON ledger_items;
CREATE POLICY ledger_items_tenant ON ledger_items
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── Resource Transactions (atomic shelf→server moves) ───────────────────────
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id         UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ledger_item_id  UUID        NOT NULL REFERENCES ledger_items(id) ON DELETE CASCADE,
  device_id       UUID        REFERENCES device_instances(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL CHECK (action IN ('add', 'remove', 'reserve', 'unreserve', 'install', 'uninstall')),
  quantity        INTEGER     NOT NULL CHECK (quantity > 0),
  note            TEXT,
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_item ON ledger_transactions(ledger_item_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_site ON ledger_transactions(org_id, site_id);

ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ledger_tx_tenant ON ledger_transactions;
CREATE POLICY ledger_tx_tenant ON ledger_transactions
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── Heartbeat Buffer ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS heartbeats (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  device_id   UUID        NOT NULL REFERENCES device_instances(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'up'
                          CHECK (status IN ('up', 'down', 'degraded', 'unknown')),
  latency_ms  INTEGER,
  payload     JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_device  ON heartbeats(device_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_site    ON heartbeats(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_time    ON heartbeats(received_at DESC);

ALTER TABLE heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS heartbeats_tenant ON heartbeats;
CREATE POLICY heartbeats_tenant ON heartbeats
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── Device Events (state machine log) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  device_id   UUID        REFERENCES device_instances(id) ON DELETE SET NULL,
  event_type  TEXT        NOT NULL
                          CHECK (event_type IN (
                            'status_change', 'heartbeat_missed', 'heartbeat_restored',
                            'draft_created', 'draft_promoted', 'draft_abandoned',
                            'install', 'uninstall', 'maintenance_start', 'maintenance_end'
                          )),
  from_state  TEXT,
  to_state    TEXT,
  details     JSONB,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_events_device ON device_events(device_id);
CREATE INDEX IF NOT EXISTS idx_device_events_site   ON device_events(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_device_events_time   ON device_events(created_at DESC);

ALTER TABLE device_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_events_tenant ON device_events;
CREATE POLICY device_events_tenant ON device_events
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── Git-Sync Configuration ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS git_sync_config (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id         UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  repo_url        TEXT        NOT NULL,
  branch          TEXT        NOT NULL DEFAULT 'main',
  enabled         BOOLEAN     NOT NULL DEFAULT false,
  push_interval   INTEGER     NOT NULL DEFAULT 300,   -- seconds (5 min default)
  last_push_at    TIMESTAMPTZ,
  last_push_error TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, site_id)
);

ALTER TABLE git_sync_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS git_sync_tenant ON git_sync_config;
CREATE POLICY git_sync_tenant ON git_sync_config
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── Device status tracking column ───────────────────────────────────────────
-- Add a current_status column to device_instances for quick status reads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_instances' AND column_name = 'current_status'
  ) THEN
    ALTER TABLE device_instances ADD COLUMN current_status TEXT DEFAULT 'unknown'
      CHECK (current_status IN ('up', 'down', 'degraded', 'unknown', 'maintenance'));
  END IF;
END $$;
