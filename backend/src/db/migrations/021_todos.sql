-- Migration 021: Todo folders, items, checklists, and entity tags
-- Phase 9: Guides & Todos

-- todo_folders
CREATE TABLE IF NOT EXISTS todo_folders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  parent_folder_id UUID REFERENCES todo_folders(id) ON DELETE SET NULL,
  sort_order       INT  NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE todo_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY todo_folders_org ON todo_folders
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- todo_items
CREATE TABLE IF NOT EXISTS todo_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  folder_id        UUID REFERENCES todo_folders(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  priority         TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'in_progress', 'done')),
  due_date         DATE,
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY todo_items_org ON todo_items
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- todo_checklists
CREATE TABLE IF NOT EXISTS todo_checklists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  todo_id    UUID NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  checked    BOOLEAN NOT NULL DEFAULT false,
  sort_order INT     NOT NULL DEFAULT 0
);

ALTER TABLE todo_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY todo_checklists_org ON todo_checklists
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- todo_entity_tags
CREATE TABLE IF NOT EXISTS todo_entity_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  todo_id     UUID NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
                CHECK (entity_type IN ('device','pool','share','subnet','host','vm','app','container')),
  entity_id   UUID NOT NULL,
  UNIQUE (todo_id, entity_type, entity_id)
);

ALTER TABLE todo_entity_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY todo_entity_tags_org ON todo_entity_tags
  USING (org_id = current_setting('app.current_org_id')::uuid);
