-- ── PCIe Standardization ─────────────────────────────────────────────────────
-- Rename lane_depth → lane_width, convert form_factor 'dw' → 'fh-dw',
-- convert pcie-dw blocks in device template layouts to pcie-fh with doubleWidth meta,
-- update pcie-fh/pcie-lp block widths from 4 → 5.

-- 1. Rename column
ALTER TABLE pcie_card_templates RENAME COLUMN lane_depth TO lane_width;

-- 2. Convert form_factor 'dw' → 'fh-dw'
UPDATE pcie_card_templates SET form_factor = 'fh-dw' WHERE form_factor = 'dw';

-- 3. Drop old check constraint and add new one
ALTER TABLE pcie_card_templates DROP CONSTRAINT IF EXISTS pcie_card_templates_form_factor_check;
ALTER TABLE pcie_card_templates ADD CONSTRAINT pcie_card_templates_form_factor_check
  CHECK (form_factor IN ('fh', 'lp', 'fh-dw', 'lp-dw'));

-- 4. Convert pcie-dw blocks in device_templates layout JSONB to pcie-fh with doubleWidth meta
-- and update pcie-fh/pcie-lp widths from 4 → 5
UPDATE device_templates
SET layout = (
  SELECT jsonb_build_object(
    'front', COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN b->>'type' = 'pcie-fh' THEN b || '{"w": 5}'::jsonb
          WHEN b->>'type' = 'pcie-lp' THEN b || '{"w": 5}'::jsonb
          WHEN b->>'type' = 'pcie-dw' THEN b || jsonb_build_object(
            'type', 'pcie-fh', 'w', 5,
            'meta', COALESCE(b->'meta', '{}'::jsonb) || '{"doubleWidth": true}'::jsonb
          )
          ELSE b
        END
      )
      FROM jsonb_array_elements(layout->'front') AS b
    ), '[]'::jsonb),
    'rear', COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN b->>'type' = 'pcie-fh' THEN b || '{"w": 5}'::jsonb
          WHEN b->>'type' = 'pcie-lp' THEN b || '{"w": 5}'::jsonb
          WHEN b->>'type' = 'pcie-dw' THEN b || jsonb_build_object(
            'type', 'pcie-fh', 'w', 5,
            'meta', COALESCE(b->'meta', '{}'::jsonb) || '{"doubleWidth": true}'::jsonb
          )
          ELSE b
        END
      )
      FROM jsonb_array_elements(layout->'rear') AS b
    ), '[]'::jsonb)
  )
)
WHERE layout::text LIKE '%pcie-%';
