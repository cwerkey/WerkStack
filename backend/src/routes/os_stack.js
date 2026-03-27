'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ── Validation schemas ────────────────────────────────────────────────────────

const ExtraIpSchema = z.object({
  label: z.string().max(100),
  ip:    z.string().max(100),
});

const VmDriveSchema = z.object({
  label:      z.string().max(200),
  size:       z.string().max(50),
  mountpoint: z.string().max(500).optional(),
});

const OsHostSchema = z.object({
  deviceId:  z.string().uuid(),
  hostOs:    z.string().min(1).max(200),
  osVersion: z.string().max(200).optional(),
  kernel:    z.string().max(200).optional(),
  notes:     z.string().max(2000).optional(),
});

const OsVmSchema = z.object({
  hostId:     z.string().uuid(),
  parentVmId: z.string().uuid().optional().nullable(),
  name:       z.string().min(1).max(200),
  typeId:     z.string().min(1).max(50),
  vmOs:       z.string().max(200).optional(),
  osVersion:  z.string().max(200).optional(),
  cpus:       z.number().int().positive().optional().nullable(),
  ramGb:      z.number().positive().optional().nullable(),
  ip:         z.string().max(100).optional(),
  extraIps:   z.array(ExtraIpSchema).default([]),
  drives:     z.array(VmDriveSchema).default([]),
  notes:      z.string().max(2000).optional(),
});

const OsAppSchema = z.object({
  vmId:     z.string().uuid().optional().nullable(),
  hostId:   z.string().uuid().optional().nullable(),
  name:     z.string().min(1).max(200),
  typeId:   z.string().min(1).max(50),
  version:  z.string().max(200).optional(),
  url:      z.string().max(1000).optional(),
  ip:       z.string().max(100).optional(),
  extraIps: z.array(ExtraIpSchema).default([]),
  notes:    z.string().max(2000).optional(),
}).refine(d => d.vmId || d.hostId, { message: 'vmId or hostId required' });

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toHost(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    deviceId:  row.device_id,
    hostOs:    row.host_os,
    osVersion: row.os_version ?? undefined,
    kernel:    row.kernel ?? undefined,
    notes:     row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function toVm(row) {
  return {
    id:          row.id,
    orgId:       row.org_id,
    siteId:      row.site_id,
    hostId:      row.host_id,
    parentVmId:  row.parent_vm_id ?? undefined,
    name:        row.name,
    typeId:      row.type_id,
    vmOs:        row.vm_os ?? undefined,
    osVersion:   row.os_version ?? undefined,
    cpus:        row.cpus ?? undefined,
    ramGb:       row.ram_gb != null ? parseFloat(row.ram_gb) : undefined,
    ip:          row.ip ?? undefined,
    extraIps:    parseJson(row.extra_ips, []),
    drives:      parseJson(row.drives, []),
    notes:       row.notes ?? undefined,
    createdAt:   row.created_at,
  };
}

function toApp(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    vmId:      row.vm_id ?? undefined,
    hostId:    row.host_id ?? undefined,
    name:      row.name,
    typeId:    row.type_id,
    version:   row.version ?? undefined,
    url:       row.url ?? undefined,
    ip:        row.ip ?? undefined,
    extraIps:  parseJson(row.extra_ips, []),
    notes:     row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

module.exports = function osStackRoutes(db) {
  const router = express.Router({ mergeParams: true });

  // ═══════════════════════════════════════════════════════════════════════════
  // OS HOSTS — /api/sites/:siteId/os-hosts
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/:siteId/os-hosts', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM os_hosts WHERE site_id = $1 AND org_id = $2 ORDER BY created_at`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toHost));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/os-hosts]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/:siteId/os-hosts',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(OsHostSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { deviceId, hostOs, osVersion, kernel, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO os_hosts (org_id, site_id, device_id, host_os, os_version, kernel, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (org_id, device_id)
             DO UPDATE SET host_os=$4, os_version=$5, kernel=$6, notes=$7
             RETURNING *`,
            [orgId, siteId, deviceId, hostOs, osVersion ?? null, kernel ?? null, notes ?? null]
          )
        );
        res.status(201).json(toHost(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/os-hosts]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/os-hosts/:hostId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(OsHostSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, hostId } = req.params;
      const { deviceId, hostOs, osVersion, kernel, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE os_hosts
             SET device_id=$1, host_os=$2, os_version=$3, kernel=$4, notes=$5
             WHERE id=$6 AND site_id=$7 AND org_id=$8
             RETURNING *`,
            [deviceId, hostOs, osVersion ?? null, kernel ?? null, notes ?? null,
             hostId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'host not found' });
        res.json(toHost(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/os-hosts/${hostId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/os-hosts/:hostId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, hostId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM os_hosts WHERE id=$1 AND site_id=$2 AND org_id=$3 RETURNING id`,
            [hostId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'host not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/os-hosts/${hostId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // OS VMs — /api/sites/:siteId/os-vms
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/:siteId/os-vms', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM os_vms WHERE site_id = $1 AND org_id = $2 ORDER BY name`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toVm));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/os-vms]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/:siteId/os-vms',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(OsVmSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { hostId, parentVmId, name, typeId, vmOs, osVersion, cpus, ramGb, ip, extraIps, drives, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO os_vms
               (org_id, site_id, host_id, parent_vm_id, name, type_id,
                vm_os, os_version, cpus, ram_gb, ip, extra_ips, drives, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING *`,
            [orgId, siteId, hostId, parentVmId ?? null, name, typeId,
             vmOs ?? null, osVersion ?? null, cpus ?? null, ramGb ?? null,
             ip ?? null, JSON.stringify(extraIps ?? []), JSON.stringify(drives ?? []), notes ?? null]
          )
        );
        res.status(201).json(toVm(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/os-vms]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/os-vms/:vmId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(OsVmSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, vmId } = req.params;
      const { hostId, parentVmId, name, typeId, vmOs, osVersion, cpus, ramGb, ip, extraIps, drives, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE os_vms
             SET host_id=$1, parent_vm_id=$2, name=$3, type_id=$4,
                 vm_os=$5, os_version=$6, cpus=$7, ram_gb=$8, ip=$9,
                 extra_ips=$10, drives=$11, notes=$12
             WHERE id=$13 AND site_id=$14 AND org_id=$15
             RETURNING *`,
            [hostId, parentVmId ?? null, name, typeId,
             vmOs ?? null, osVersion ?? null, cpus ?? null, ramGb ?? null, ip ?? null,
             JSON.stringify(extraIps ?? []), JSON.stringify(drives ?? []), notes ?? null,
             vmId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'vm not found' });
        res.json(toVm(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/os-vms/${vmId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/os-vms/:vmId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, vmId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM os_vms WHERE id=$1 AND site_id=$2 AND org_id=$3 RETURNING id`,
            [vmId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'vm not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/os-vms/${vmId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // OS APPS — /api/sites/:siteId/os-apps
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/:siteId/os-apps', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM os_apps WHERE site_id = $1 AND org_id = $2 ORDER BY name`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toApp));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/os-apps]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/:siteId/os-apps',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(OsAppSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { vmId, hostId, name, typeId, version, url, ip, extraIps, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO os_apps
               (org_id, site_id, vm_id, host_id, name, type_id, version, url, ip, extra_ips, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [orgId, siteId, vmId ?? null, hostId ?? null, name, typeId,
             version ?? null, url ?? null, ip ?? null, JSON.stringify(extraIps ?? []), notes ?? null]
          )
        );
        res.status(201).json(toApp(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/os-apps]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/os-apps/:appId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(OsAppSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, appId } = req.params;
      const { vmId, hostId, name, typeId, version, url, ip, extraIps, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE os_apps
             SET vm_id=$1, host_id=$2, name=$3, type_id=$4,
                 version=$5, url=$6, ip=$7, extra_ips=$8, notes=$9
             WHERE id=$10 AND site_id=$11 AND org_id=$12
             RETURNING *`,
            [vmId ?? null, hostId ?? null, name, typeId,
             version ?? null, url ?? null, ip ?? null,
             JSON.stringify(extraIps ?? []), notes ?? null,
             appId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'app not found' });
        res.json(toApp(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/os-apps/${appId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/os-apps/:appId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, appId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM os_apps WHERE id=$1 AND site_id=$2 AND org_id=$3 RETURNING id`,
            [appId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'app not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/os-apps/${appId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
