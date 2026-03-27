-- ─────────────────────────────────────────────────────────────────────────────
-- WerkStack — Migration 002: Type System
-- device_types, pcie_types, cable_types, vm_types, app_types, ticket_categories
--
-- Conventions:
--   • id is TEXT (not UUID) to allow human-readable slug IDs for built-ins
--     (e.g. 'dt-server', 'pcie-nic') while custom org types use UUID strings.
--   • org_id is NULL for built-in types, UUID for custom org types.
--   • RLS: built-ins (org_id IS NULL) visible to all authenticated orgs;
--     custom types visible only to their owning org.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Device Types ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS device_types (
  id         TEXT        PRIMARY KEY,
  org_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#8a9299',
  is_builtin BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_types_org_id_idx ON device_types (org_id);

ALTER TABLE device_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_types_rls ON device_types
  USING (org_id IS NULL OR org_id = current_org_id() OR current_org_id() IS NULL);

INSERT INTO device_types (id, org_id, name, color, is_builtin) VALUES
  ('dt-server',       NULL, 'Server',        '#7090b8', TRUE),
  ('dt-switch',       NULL, 'Network Switch', '#8ab89e', TRUE),
  ('dt-firewall',     NULL, 'Firewall',       '#c07070', TRUE),
  ('dt-nas',          NULL, 'NAS',            '#aa8abb', TRUE),
  ('dt-pdu',          NULL, 'PDU',            '#b89870', TRUE),
  ('dt-ups',          NULL, 'UPS',            '#8ab89e', TRUE),
  ('dt-patch-panel',  NULL, 'Patch Panel',    '#7090b8', TRUE),
  ('dt-kvm',          NULL, 'KVM Switch',     '#8a9299', TRUE),
  ('dt-other',        NULL, 'Other',          '#4e5560', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── PCIe Types ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pcie_types (
  id         TEXT        PRIMARY KEY,
  org_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#8a9299',
  is_builtin BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pcie_types_org_id_idx ON pcie_types (org_id);

ALTER TABLE pcie_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY pcie_types_rls ON pcie_types
  USING (org_id IS NULL OR org_id = current_org_id() OR current_org_id() IS NULL);

INSERT INTO pcie_types (id, org_id, name, color, is_builtin) VALUES
  ('pcie-nic',     NULL, 'NIC',          '#7090b8', TRUE),
  ('pcie-hba',     NULL, 'HBA',          '#aa8abb', TRUE),
  ('pcie-gpu',     NULL, 'GPU',          '#c07070', TRUE),
  ('pcie-capture', NULL, 'Capture Card', '#8ab89e', TRUE),
  ('pcie-other',   NULL, 'Other',        '#4e5560', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── Cable Types ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cable_types (
  id         TEXT        PRIMARY KEY,
  org_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#8a9299',
  is_builtin BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cable_types_org_id_idx ON cable_types (org_id);

ALTER TABLE cable_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY cable_types_rls ON cable_types
  USING (org_id IS NULL OR org_id = current_org_id() OR current_org_id() IS NULL);

INSERT INTO cable_types (id, org_id, name, color, is_builtin) VALUES
  ('cable-cat5e',    NULL, 'CAT5e',          '#8ab89e', TRUE),
  ('cable-cat6',     NULL, 'CAT6',           '#7090b8', TRUE),
  ('cable-cat6a',    NULL, 'CAT6A',          '#8a9299', TRUE),
  ('cable-fiber-sm', NULL, 'Fiber (SM)',      '#c47c5a', TRUE),
  ('cable-fiber-mm', NULL, 'Fiber (MM)',      '#b89870', TRUE),
  ('cable-dac',      NULL, 'DAC',             '#aa8abb', TRUE),
  ('cable-aoc',      NULL, 'AOC',             '#c07070', TRUE),
  ('cable-power',    NULL, 'Power (C13/C14)', '#b89870', TRUE),
  ('cable-usb',      NULL, 'USB',             '#8a9299', TRUE),
  ('cable-other',    NULL, 'Other',           '#4e5560', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── VM / Container Types ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vm_types (
  id         TEXT        PRIMARY KEY,
  org_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#8a9299',
  is_builtin BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vm_types_org_id_idx ON vm_types (org_id);

ALTER TABLE vm_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY vm_types_rls ON vm_types
  USING (org_id IS NULL OR org_id = current_org_id() OR current_org_id() IS NULL);

INSERT INTO vm_types (id, org_id, name, color, is_builtin) VALUES
  ('vt-vm',     NULL, 'Virtual Machine',  '#7090b8', TRUE),
  ('vt-lxc',    NULL, 'LXC Container',    '#8ab89e', TRUE),
  ('vt-docker', NULL, 'Docker Container', '#aa8abb', TRUE),
  ('vt-other',  NULL, 'Other',            '#4e5560', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── App / Service Types ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_types (
  id         TEXT        PRIMARY KEY,
  org_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#8a9299',
  is_builtin BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_types_org_id_idx ON app_types (org_id);

ALTER TABLE app_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_types_rls ON app_types
  USING (org_id IS NULL OR org_id = current_org_id() OR current_org_id() IS NULL);

INSERT INTO app_types (id, org_id, name, color, is_builtin) VALUES
  ('at-web',        NULL, 'Web Server',      '#7090b8', TRUE),
  ('at-proxy',      NULL, 'Reverse Proxy',   '#8ab89e', TRUE),
  ('at-monitoring', NULL, 'Monitoring',      '#c07070', TRUE),
  ('at-database',   NULL, 'Database',        '#aa8abb', TRUE),
  ('at-storage',    NULL, 'Storage Service', '#b89870', TRUE),
  ('at-media',      NULL, 'Media Server',    '#c47c5a', TRUE),
  ('at-security',   NULL, 'Security',        '#c07070', TRUE),
  ('at-network',    NULL, 'Network Service', '#8a9299', TRUE),
  ('at-other',      NULL, 'Other',           '#4e5560', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── Ticket Categories ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ticket_categories (
  id         TEXT        PRIMARY KEY,
  org_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#8a9299',
  is_builtin BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_categories_org_id_idx ON ticket_categories (org_id);

ALTER TABLE ticket_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_categories_rls ON ticket_categories
  USING (org_id IS NULL OR org_id = current_org_id() OR current_org_id() IS NULL);

INSERT INTO ticket_categories (id, org_id, name, color, is_builtin) VALUES
  ('tcat-hardware',    NULL, 'Hardware Failure',  '#c07070', TRUE),
  ('tcat-maintenance', NULL, 'Maintenance',       '#b89870', TRUE),
  ('tcat-performance', NULL, 'Performance Issue', '#8ab89e', TRUE),
  ('tcat-config',      NULL, 'Configuration',     '#7090b8', TRUE),
  ('tcat-security',    NULL, 'Security',          '#c07070', TRUE),
  ('tcat-network',     NULL, 'Network Issue',     '#8a9299', TRUE),
  ('tcat-other',       NULL, 'Other',             '#4e5560', TRUE)
ON CONFLICT (id) DO NOTHING;
