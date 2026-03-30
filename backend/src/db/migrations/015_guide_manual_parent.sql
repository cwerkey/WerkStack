-- 015_guide_manual_parent.sql — Nested manual sections (parent_id)

ALTER TABLE guide_manuals ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES guide_manuals(id) ON DELETE SET NULL;
