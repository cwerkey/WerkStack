-- Migration 032: Add monitor_ip and monitor_interval_s to containers and os_apps

ALTER TABLE containers
  ADD COLUMN IF NOT EXISTS monitor_ip         TEXT,
  ADD COLUMN IF NOT EXISTS monitor_interval_s INTEGER NOT NULL DEFAULT 60;

ALTER TABLE os_apps
  ADD COLUMN IF NOT EXISTS monitor_ip         TEXT,
  ADD COLUMN IF NOT EXISTS monitor_interval_s INTEGER NOT NULL DEFAULT 60;
