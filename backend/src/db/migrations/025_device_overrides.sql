-- ── Phase 3: Device port/slot overrides + drive interface type ───────────────

-- Per-instance port metadata (label, speed, MAC) keyed by PlacedBlock.id
ALTER TABLE device_instances
  ADD COLUMN IF NOT EXISTS port_overrides JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS slot_overrides JSONB DEFAULT '{}';

-- Drive interface type (physical connector, not media type)
ALTER TABLE drives
  ADD COLUMN IF NOT EXISTS interface_type TEXT;
