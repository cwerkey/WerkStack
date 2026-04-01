-- 023: Add missing RLS policies to 7 tables
-- Tables: guides, tickets, guide_manuals, guide_versions, guide_links,
--         dashboard_widgets, module_instances

-- 1. guides (has org_id directly)
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY guides_org ON guides
  USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- 2. tickets (has org_id directly)
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_org ON tickets
  USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- 3. guide_manuals (has org_id directly)
ALTER TABLE guide_manuals ENABLE ROW LEVEL SECURITY;
CREATE POLICY guide_manuals_org ON guide_manuals
  USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- 4. guide_versions (has org_id directly)
ALTER TABLE guide_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY guide_versions_org ON guide_versions
  USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- 5. guide_links (has org_id directly)
ALTER TABLE guide_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY guide_links_org ON guide_links
  USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- 6. dashboard_widgets (no org_id — join through sites)
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_widgets_org ON dashboard_widgets
  USING (site_id IN (
    SELECT id FROM sites WHERE org_id = current_org_id()
  ) OR current_org_id() IS NULL);

-- 7. module_instances (no org_id — join through device_instances)
ALTER TABLE module_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY module_instances_org ON module_instances
  USING (device_id IN (
    SELECT id FROM device_instances WHERE org_id = current_org_id()
  ) OR current_org_id() IS NULL);
