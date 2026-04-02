-- 028_monitoring.sql — Phase 8: Monitoring & Heartbeat

-- ── Per-device monitoring columns on device_instances ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_instances' AND column_name = 'monitor_enabled'
  ) THEN
    ALTER TABLE device_instances
      ADD COLUMN monitor_enabled    BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN monitor_ip         TEXT,
      ADD COLUMN monitor_interval_s INTEGER NOT NULL DEFAULT 60;
  END IF;
END $$;

-- ── Per-site monitoring configuration ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'monitor_config'
  ) THEN
    ALTER TABLE sites
      ADD COLUMN monitor_config JSONB NOT NULL DEFAULT '{"intervalS":60,"timeoutMs":5000,"missedThreshold":2}'::jsonb;
  END IF;
END $$;
