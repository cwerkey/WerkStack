-- 012_feature_batch.sql — Manufacturer field, shelf/router types, drive inventory, shelf placement
-- Features: manufacturer on templates, dt-shelf + dt-router types, nullable drive.device_id,
--           shelf placement columns on device_instances

-- ── Add manufacturer to device_templates ────────────────────────────────────
ALTER TABLE device_templates ADD COLUMN IF NOT EXISTS manufacturer TEXT;

-- ── Add manufacturer to pcie_card_templates ─────────────────────────────────
ALTER TABLE pcie_card_templates ADD COLUMN IF NOT EXISTS manufacturer TEXT;

-- ── Make drives.device_id nullable for inventory/ledger drives ──────────────
ALTER TABLE drives ALTER COLUMN device_id DROP NOT NULL;

-- ── Add shelf placement columns to device_instances ─────────────────────────
ALTER TABLE device_instances ADD COLUMN IF NOT EXISTS shelf_device_id UUID REFERENCES device_instances(id) ON DELETE SET NULL;
ALTER TABLE device_instances ADD COLUMN IF NOT EXISTS shelf_col INTEGER;
ALTER TABLE device_instances ADD COLUMN IF NOT EXISTS shelf_row INTEGER;

CREATE INDEX IF NOT EXISTS idx_devices_shelf ON device_instances(shelf_device_id);

-- ── Seed dt-shelf and dt-router device types ────────────────────────────────
INSERT INTO device_types (id, org_id, name, color, is_builtin) VALUES
  ('dt-shelf',  NULL, 'Shelf',  '#8a9299', TRUE),
  ('dt-router', NULL, 'Router', '#b89870', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── Add power_budget_watts to racks (if missing from earlier migration) ─────
ALTER TABLE racks ADD COLUMN IF NOT EXISTS power_budget_watts INTEGER;
