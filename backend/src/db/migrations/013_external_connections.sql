-- 013_external_connections.sql
-- Allow connections to represent external/internet endpoints via externalLabel
-- instead of requiring a dstDeviceId (physical device in the site).

ALTER TABLE connections ALTER COLUMN dst_device_id DROP NOT NULL;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS external_label TEXT;

-- Enforce mutual exclusivity: exactly one of dst_device_id or external_label must be set
ALTER TABLE connections ADD CONSTRAINT connections_dst_xor_external
  CHECK (
    (dst_device_id IS NOT NULL AND external_label IS NULL) OR
    (dst_device_id IS NULL     AND external_label IS NOT NULL)
  );

-- Index for topology queries that need external connections by label
CREATE INDEX IF NOT EXISTS connections_external_label_idx
  ON connections (site_id, external_label)
  WHERE external_label IS NOT NULL;
