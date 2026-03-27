-- 007_os_stack.sql — OS Stack: Hosts, VMs, Applications (Phase 8)

-- ── OS Hosts (host OS layer for a physical device) ────────────────────────────
CREATE TABLE IF NOT EXISTS os_hosts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES device_instances(id) ON DELETE CASCADE,
  host_os     TEXT NOT NULL,
  os_version  TEXT,
  kernel      TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_os_hosts_org    ON os_hosts(org_id);
CREATE INDEX IF NOT EXISTS idx_os_hosts_site   ON os_hosts(site_id);
CREATE INDEX IF NOT EXISTS idx_os_hosts_device ON os_hosts(device_id);

ALTER TABLE os_hosts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS os_hosts_tenant ON os_hosts;
CREATE POLICY os_hosts_tenant ON os_hosts
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── OS VMs (virtual machines, containers, docker instances) ───────────────────
CREATE TABLE IF NOT EXISTS os_vms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id),
  site_id      UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  host_id      UUID NOT NULL REFERENCES os_hosts(id) ON DELETE CASCADE,
  parent_vm_id UUID REFERENCES os_vms(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  type_id      TEXT NOT NULL,
  vm_os        TEXT,
  os_version   TEXT,
  cpus         INTEGER,
  ram_gb       NUMERIC(8,2),
  ip           TEXT,
  extra_ips    JSONB NOT NULL DEFAULT '[]',
  drives       JSONB NOT NULL DEFAULT '[]',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_os_vms_org    ON os_vms(org_id);
CREATE INDEX IF NOT EXISTS idx_os_vms_site   ON os_vms(site_id);
CREATE INDEX IF NOT EXISTS idx_os_vms_host   ON os_vms(host_id);
CREATE INDEX IF NOT EXISTS idx_os_vms_parent ON os_vms(parent_vm_id);

ALTER TABLE os_vms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS os_vms_tenant ON os_vms;
CREATE POLICY os_vms_tenant ON os_vms
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);

-- ── OS Apps (applications/services) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS os_apps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  vm_id      UUID REFERENCES os_vms(id) ON DELETE CASCADE,
  host_id    UUID REFERENCES os_hosts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type_id    TEXT NOT NULL,
  version    TEXT,
  url        TEXT,
  ip         TEXT,
  extra_ips  JSONB NOT NULL DEFAULT '[]',
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (vm_id IS NOT NULL OR host_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_os_apps_org    ON os_apps(org_id);
CREATE INDEX IF NOT EXISTS idx_os_apps_site   ON os_apps(site_id);
CREATE INDEX IF NOT EXISTS idx_os_apps_vm     ON os_apps(vm_id);
CREATE INDEX IF NOT EXISTS idx_os_apps_host   ON os_apps(host_id);

ALTER TABLE os_apps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS os_apps_tenant ON os_apps;
CREATE POLICY os_apps_tenant ON os_apps
  USING (org_id = current_setting('app.current_org_id', true)::uuid
         OR current_setting('app.current_org_id', true) IS NULL);
