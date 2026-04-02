-- Add monitor_enabled to containers and os_apps for lightweight on/off monitoring toggle

ALTER TABLE containers
  ADD COLUMN IF NOT EXISTS monitor_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE os_apps
  ADD COLUMN IF NOT EXISTS monitor_enabled BOOLEAN NOT NULL DEFAULT false;
