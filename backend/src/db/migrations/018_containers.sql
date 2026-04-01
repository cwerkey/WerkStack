-- 018_containers.sql — Docker/OCI container inventory

CREATE TABLE IF NOT EXISTS containers (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL REFERENCES organizations(id),
  site_id                 UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  host_id                 UUID        REFERENCES os_hosts(id) ON DELETE CASCADE,
  vm_id                   UUID        REFERENCES os_vms(id) ON DELETE CASCADE,
  name                    TEXT        NOT NULL,
  image                   TEXT        NOT NULL,
  tag                     TEXT        NOT NULL DEFAULT 'latest',
  status                  TEXT        NOT NULL DEFAULT 'unknown',
  ports                   JSONB       NOT NULL DEFAULT '[]',
  volumes                 JSONB       NOT NULL DEFAULT '[]',
  networks                JSONB       NOT NULL DEFAULT '[]',
  compose_file            TEXT,
  compose_service         TEXT,
  upstream_dependency_id  UUID        REFERENCES containers(id) ON DELETE SET NULL,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('running', 'stopped', 'paused', 'unknown')),
  CHECK (host_id IS NOT NULL OR vm_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS containers_site_idx  ON containers (site_id);
CREATE INDEX IF NOT EXISTS containers_host_idx  ON containers (host_id);
CREATE INDEX IF NOT EXISTS containers_vm_idx    ON containers (vm_id);

ALTER TABLE containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY containers_org ON containers
  USING (org_id = current_org_id() OR current_org_id() IS NULL);
