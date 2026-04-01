-- Security groups table
CREATE TABLE IF NOT EXISTS security_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Security group permissions (per-category R/W/X)
CREATE TABLE IF NOT EXISTS security_group_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES security_groups(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('infrastructure', 'storage', 'networking', 'os', 'topology', 'docs', 'activity', 'settings')),
  can_read BOOLEAN NOT NULL DEFAULT false,
  can_write BOOLEAN NOT NULL DEFAULT false,
  can_execute BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(group_id, category)
);

-- User → site → security group assignments
CREATE TABLE IF NOT EXISTS user_site_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  security_group_id UUID NOT NULL REFERENCES security_groups(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, site_id, security_group_id)
);

-- RLS
ALTER TABLE security_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_group_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_site_permissions ENABLE ROW LEVEL SECURITY;

-- RLS policies (org-scoped)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'security_groups_org_isolation') THEN
    CREATE POLICY security_groups_org_isolation ON security_groups
      USING (org_id::text = current_setting('app.current_org_id', true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'security_group_permissions_org_isolation') THEN
    CREATE POLICY security_group_permissions_org_isolation ON security_group_permissions
      USING (
        group_id IN (
          SELECT id FROM security_groups
          WHERE org_id::text = current_setting('app.current_org_id', true)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_site_permissions_org_isolation') THEN
    CREATE POLICY user_site_permissions_org_isolation ON user_site_permissions
      USING (org_id::text = current_setting('app.current_org_id', true));
  END IF;
END $$;

-- Permission check function
CREATE OR REPLACE FUNCTION check_permission(
  p_user_id UUID, p_site_id UUID, p_category TEXT, p_action TEXT
) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_site_permissions usp
    JOIN security_group_permissions sgp ON sgp.group_id = usp.security_group_id
    WHERE usp.user_id = p_user_id
      AND usp.site_id = p_site_id
      AND sgp.category = p_category
      AND CASE p_action
        WHEN 'read' THEN sgp.can_read
        WHEN 'write' THEN sgp.can_write
        WHEN 'execute' THEN sgp.can_execute
        ELSE false
      END
  );
$$ LANGUAGE sql STABLE;
