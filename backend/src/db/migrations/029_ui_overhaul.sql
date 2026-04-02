-- 029 — UI overhaul: user accent color, guide sharing
ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_color TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE guide_manuals ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;
