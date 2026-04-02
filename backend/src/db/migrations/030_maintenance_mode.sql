-- 030 — maintenance mode flag on monitored devices
ALTER TABLE device_instances
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT false;
