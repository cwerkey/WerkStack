-- Phase 5: Device Library & Template System
-- Tables: device_templates, pcie_card_templates, module_instances

-- ── Device Templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  make         TEXT NOT NULL,
  model        TEXT NOT NULL,
  category     TEXT NOT NULL,
  form_factor  TEXT NOT NULL CHECK (form_factor IN ('rack', 'desktop', 'wall-mount')),
  u_height     INTEGER NOT NULL CHECK (u_height >= 1),
  grid_cols    INTEGER,
  grid_rows    INTEGER,
  wattage_max  INTEGER,
  layout       JSONB NOT NULL DEFAULT '{"front":[],"rear":[]}',
  image_url    TEXT,
  is_shelf     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE device_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_templates_org ON device_templates
  USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- ── PCIe Card Templates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pcie_card_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  make         TEXT NOT NULL,
  model        TEXT NOT NULL,
  bus_size     TEXT NOT NULL CHECK (bus_size IN ('x1', 'x4', 'x8', 'x16')),
  form_factor  TEXT NOT NULL CHECK (form_factor IN ('fh', 'lp', 'dw')),
  lane_depth   INTEGER NOT NULL DEFAULT 1,
  layout       JSONB NOT NULL DEFAULT '{"rear":[]}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pcie_card_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY pcie_card_templates_org ON pcie_card_templates
  USING (org_id = current_setting('app.current_org_id', true)::UUID);

-- ── Module Instances (PCIe cards installed in device slots) ──────────────────
CREATE TABLE IF NOT EXISTS module_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         UUID NOT NULL,
  slot_block_id     UUID NOT NULL,
  card_template_id  UUID NOT NULL REFERENCES pcie_card_templates(id) ON DELETE CASCADE,
  serial_number     TEXT,
  asset_tag         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE module_instances ENABLE ROW LEVEL SECURITY;

-- module_instances RLS via device → device_instances (will be joined later)
-- For now, we enforce access at the application layer since device_instances
-- table doesn't exist yet (Phase 6). Add RLS policy when device_instances lands.

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_device_templates_org ON device_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_pcie_card_templates_org ON pcie_card_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_module_instances_device ON module_instances(device_id);
CREATE INDEX IF NOT EXISTS idx_module_instances_card ON module_instances(card_template_id);
