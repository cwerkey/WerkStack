'use strict';

const express = require('express');
const { z }   = require('zod');
const yaml    = require('js-yaml');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ContainerPortSchema = z.object({
  hostPort:      z.number(),
  containerPort: z.number(),
  protocol:      z.enum(['tcp', 'udp']),
});

const ContainerVolumeSchema = z.object({
  hostPath:      z.string(),
  containerPath: z.string(),
  readOnly:      z.boolean(),
});

const ContainerSchema = z.object({
  hostId:               z.string().uuid().optional().nullable(),
  vmId:                 z.string().uuid().optional().nullable(),
  name:                 z.string().min(1).max(200),
  image:                z.string().min(1).max(500),
  tag:                  z.string().max(200).default('latest'),
  status:               z.enum(['running', 'stopped', 'paused', 'unknown']).default('unknown'),
  ports:                z.array(ContainerPortSchema).default([]),
  volumes:              z.array(ContainerVolumeSchema).default([]),
  networks:             z.array(z.string()).default([]),
  composeFile:          z.string().max(500).optional().nullable(),
  composeService:       z.string().max(200).optional().nullable(),
  restartPolicy:        z.enum(['no', 'always', 'on-failure', 'unless-stopped']).default('no'),
  upstreamDependencyId: z.string().uuid().optional().nullable(),
  notes:                z.string().max(2000).optional(),
}).refine(d => d.hostId || d.vmId, { message: 'hostId or vmId required' });

const DockerComposeParseSchema = z.object({
  yaml:   z.string().min(1).max(500000),
  hostId: z.string().uuid().optional().nullable(),
  vmId:   z.string().uuid().optional().nullable(),
});

const DockerComposeCommitSchema = z.object({
  containers: z.array(ContainerSchema),
  hostId:     z.string().uuid().optional().nullable(),
  vmId:       z.string().uuid().optional().nullable(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function withOrg(db, orgId, fn) {
  const client = await db.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val ?? fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function toContainer(row) {
  return {
    id:                   row.id,
    orgId:                row.org_id,
    siteId:               row.site_id,
    hostId:               row.host_id ?? undefined,
    vmId:                 row.vm_id ?? undefined,
    name:                 row.name,
    image:                row.image,
    tag:                  row.tag,
    status:               row.status,
    ports:                parseJson(row.ports, []),
    volumes:              parseJson(row.volumes, []),
    networks:             parseJson(row.networks, []),
    composeFile:          row.compose_file ?? undefined,
    composeService:       row.compose_service ?? undefined,
    restartPolicy:        row.restart_policy ?? 'no',
    upstreamDependencyId: row.upstream_dependency_id ?? undefined,
    notes:                row.notes ?? undefined,
    monitorEnabled:       row.monitor_enabled ?? false,
    createdAt:            row.created_at,
  };
}

// ─── Docker Compose Parser ───────────────────────────────────────────────────

function parseDockerCompose(yamlStr, hostId, vmId) {
  const doc = yaml.load(yamlStr);
  if (!doc || typeof doc !== 'object') {
    throw new Error('invalid docker-compose file');
  }

  const services = doc.services;
  if (!services || typeof services !== 'object') {
    throw new Error('no services found in docker-compose file');
  }

  const containers = [];

  for (const [serviceName, svc] of Object.entries(services)) {
    if (!svc || typeof svc !== 'object') continue;

    // Parse image
    let image = 'unknown';
    let tag = 'latest';
    if (svc.image) {
      const parts = svc.image.split(':');
      image = parts[0];
      if (parts.length > 1) tag = parts.slice(1).join(':');
    } else if (svc.build) {
      image = serviceName;
      tag = 'build';
    }

    // Parse ports
    const ports = [];
    if (Array.isArray(svc.ports)) {
      for (const p of svc.ports) {
        if (typeof p === 'string') {
          // "8080:80" or "8080:80/tcp"
          const match = p.match(/^(\d+):(\d+)(?:\/(tcp|udp))?$/);
          if (match) {
            ports.push({
              hostPort:      parseInt(match[1], 10),
              containerPort: parseInt(match[2], 10),
              protocol:      match[3] || 'tcp',
            });
          }
        } else if (typeof p === 'object' && p !== null) {
          // long syntax
          if (p.published != null && p.target != null) {
            ports.push({
              hostPort:      parseInt(p.published, 10),
              containerPort: parseInt(p.target, 10),
              protocol:      p.protocol || 'tcp',
            });
          }
        }
      }
    }

    // Parse volumes
    const volumes = [];
    if (Array.isArray(svc.volumes)) {
      for (const v of svc.volumes) {
        if (typeof v === 'string') {
          // "/host:/container:ro" or "/host:/container"
          const parts = v.split(':');
          if (parts.length >= 2) {
            volumes.push({
              hostPath:      parts[0],
              containerPath: parts[1],
              readOnly:      parts[2] === 'ro',
            });
          }
        } else if (typeof v === 'object' && v !== null) {
          // long syntax
          volumes.push({
            hostPath:      v.source || '',
            containerPath: v.target || '',
            readOnly:      v.read_only === true,
          });
        }
      }
    }

    // Parse networks
    const networks = [];
    if (Array.isArray(svc.networks)) {
      networks.push(...svc.networks.filter(n => typeof n === 'string'));
    } else if (svc.networks && typeof svc.networks === 'object') {
      networks.push(...Object.keys(svc.networks));
    }

    // Parse restart policy
    const validPolicies = ['no', 'always', 'on-failure', 'unless-stopped'];
    const restartPolicy = validPolicies.includes(svc.restart) ? svc.restart : 'no';

    containers.push({
      hostId:         hostId ?? undefined,
      vmId:           vmId ?? undefined,
      name:           svc.container_name || serviceName,
      image,
      tag,
      status:         'unknown',
      ports,
      volumes,
      networks,
      composeFile:    'docker-compose.yml',
      composeService: serviceName,
      restartPolicy,
      notes:          undefined,
    });
  }

  return containers;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

module.exports = function containersRoutes(db) {
  const router = express.Router({ mergeParams: true });

  // GET /:siteId/containers — list all containers in site
  router.get('/:siteId/containers', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM containers WHERE site_id = $1 AND org_id = $2 ORDER BY name`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toContainer));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/containers]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /:siteId/devices/:deviceId/containers — list containers for a device
  router.get('/:siteId/devices/:deviceId/containers', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId, deviceId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT c.* FROM containers c
           LEFT JOIN os_hosts h ON c.host_id = h.id
           WHERE c.site_id = $1 AND c.org_id = $2
             AND (h.device_id = $3 OR c.host_id = $3)
           ORDER BY c.name`,
          [siteId, orgId, deviceId]
        )
      );
      res.json(result.rows.map(toContainer));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/devices/${deviceId}/containers]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /:siteId/containers — create container
  router.post(
    '/:siteId/containers',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(ContainerSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const {
        hostId, vmId, name, image, tag, status,
        ports, volumes, networks,
        composeFile, composeService, restartPolicy,
        upstreamDependencyId, notes,
      } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO containers
               (org_id, site_id, host_id, vm_id, name, image, tag, status,
                ports, volumes, networks, compose_file, compose_service,
                restart_policy, upstream_dependency_id, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             RETURNING *`,
            [orgId, siteId, hostId ?? null, vmId ?? null,
             name, image, tag ?? 'latest', status ?? 'unknown',
             JSON.stringify(ports ?? []), JSON.stringify(volumes ?? []),
             JSON.stringify(networks ?? []),
             composeFile ?? null, composeService ?? null,
             restartPolicy ?? 'no',
             upstreamDependencyId ?? null, notes ?? null]
          )
        );
        res.status(201).json(toContainer(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/containers]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  // PATCH /:siteId/containers/:containerId — update container
  router.patch(
    '/:siteId/containers/:containerId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(ContainerSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, containerId } = req.params;
      const {
        hostId, vmId, name, image, tag, status,
        ports, volumes, networks,
        composeFile, composeService, restartPolicy,
        upstreamDependencyId, notes,
      } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE containers
             SET host_id=$1, vm_id=$2, name=$3, image=$4, tag=$5, status=$6,
                 ports=$7, volumes=$8, networks=$9,
                 compose_file=$10, compose_service=$11,
                 restart_policy=$12,
                 upstream_dependency_id=$13, notes=$14
             WHERE id=$15 AND site_id=$16 AND org_id=$17
             RETURNING *`,
            [hostId ?? null, vmId ?? null,
             name, image, tag ?? 'latest', status ?? 'unknown',
             JSON.stringify(ports ?? []), JSON.stringify(volumes ?? []),
             JSON.stringify(networks ?? []),
             composeFile ?? null, composeService ?? null,
             restartPolicy ?? 'no',
             upstreamDependencyId ?? null, notes ?? null,
             containerId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'container not found' });
        res.json(toContainer(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/containers/${containerId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  // DELETE /:siteId/containers/:containerId — delete container
  router.delete(
    '/:siteId/containers/:containerId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, containerId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM containers WHERE id=$1 AND site_id=$2 AND org_id=$3 RETURNING id`,
            [containerId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'container not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/containers/${containerId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  // POST /:siteId/import/docker-compose — parse YAML and return preview
  router.post(
    '/:siteId/import/docker-compose',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(DockerComposeParseSchema),
    async (req, res) => {
      const { yaml: yamlStr, hostId, vmId } = req.body;
      try {
        const containers = parseDockerCompose(yamlStr, hostId, vmId);
        res.json({ containers });
      } catch (err) {
        console.error(`[POST /api/sites/${req.params.siteId}/import/docker-compose]`, err);
        res.status(400).json({ error: err.message || 'failed to parse docker-compose' });
      }
    }
  );

  // POST /:siteId/import/docker-compose/commit — create container records from preview
  router.post(
    '/:siteId/import/docker-compose/commit',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(DockerComposeCommitSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { containers, hostId, vmId } = req.body;
      try {
        const created = await withOrg(db, orgId, async c => {
          const results = [];
          for (const ctr of containers) {
            const finalHostId = ctr.hostId ?? hostId ?? null;
            const finalVmId   = ctr.vmId ?? vmId ?? null;
            if (!finalHostId && !finalVmId) continue;
            const r = await c.query(
              `INSERT INTO containers
                 (org_id, site_id, host_id, vm_id, name, image, tag, status,
                  ports, volumes, networks, compose_file, compose_service,
                  restart_policy, upstream_dependency_id, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
               RETURNING *`,
              [orgId, siteId, finalHostId, finalVmId,
               ctr.name, ctr.image, ctr.tag ?? 'latest', ctr.status ?? 'unknown',
               JSON.stringify(ctr.ports ?? []), JSON.stringify(ctr.volumes ?? []),
               JSON.stringify(ctr.networks ?? []),
               ctr.composeFile ?? null, ctr.composeService ?? null,
               ctr.restartPolicy ?? 'no',
               ctr.upstreamDependencyId ?? null, ctr.notes ?? null]
            );
            results.push(r.rows[0]);
          }
          return results;
        });
        res.status(201).json(created.map(toContainer));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/import/docker-compose/commit]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  // PATCH /:siteId/containers/:containerId/monitor — toggle monitoring on/off
  router.patch(
    '/:siteId/containers/:containerId/monitor',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, containerId } = req.params;
      const { monitorEnabled } = req.body;
      if (typeof monitorEnabled !== 'boolean') {
        return res.status(400).json({ error: 'monitorEnabled must be boolean' });
      }
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE containers SET monitor_enabled = $1
             WHERE id = $2 AND site_id = $3 AND org_id = $4
             RETURNING *`,
            [monitorEnabled, containerId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'container not found' });
        res.json(toContainer(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/containers/${containerId}/monitor]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
