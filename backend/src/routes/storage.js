'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const DriveSchema = z.object({
  deviceId:      z.string().uuid().optional().nullable(),
  slotBlockId:   z.string().max(200).optional(),
  label:         z.string().max(200).optional(),
  model:         z.string().max(200).optional(),
  capacity:      z.string().min(1).max(50),
  driveType:     z.enum(['hdd', 'ssd', 'nvme', 'flash', 'tape']),
  serial:        z.string().max(200).optional(),
  poolId:        z.string().uuid().optional(),
  isBoot:        z.boolean().default(false),
  vmPassthrough:  z.string().max(200).optional(),
  interfaceType:  z.enum(['sata', 'sas', 'nvme', 'u2']).optional().nullable(),
});

const VdevGroupSchema = z.object({
  id:       z.string(),
  type:     z.enum(['mirror', 'raidz1', 'raidz2', 'raidz3', 'stripe', 'special', 'log', 'cache', 'spare']),
  driveIds: z.array(z.string()),
  label:    z.string().optional(),
});

const PoolSchema = z.object({
  deviceId:   z.string().uuid(),
  name:       z.string().min(1).max(100),
  color:      z.string().max(20).default('#4a8fc4'),
  poolType:   z.enum(['zfs', 'raid', 'ceph', 'lvm', 'drive']),
  raidLevel:  z.string().max(20).default('stripe'),
  vdevGroups: z.array(VdevGroupSchema).default([]),
  health:     z.enum(['online', 'degraded', 'faulted', 'offline', 'unknown']).default('unknown'),
  notes:      z.string().max(2000).optional(),
});

const ShareSchema = z.object({
  poolId:     z.string().uuid().optional(),
  name:       z.string().min(1).max(200),
  protocol:   z.enum(['smb', 'nfs', 'iscsi']),
  path:       z.string().max(500).optional(),
  accessMode: z.enum(['public', 'auth', 'list']).default('public'),
  accessList: z.array(z.string().max(200)).default([]),
  notes:      z.string().max(2000).optional(),
});

async function withOrg(db, orgId, fn) {
  const client = await db.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

function toDrive(row) {
  return {
    id:            row.id,
    orgId:         row.org_id,
    siteId:        row.site_id,
    deviceId:      row.device_id,
    poolId:        row.pool_id ?? undefined,
    slotBlockId:   row.slot_block_id ?? undefined,
    label:         row.label ?? undefined,
    model:         row.model ?? undefined,
    capacity:      row.capacity,
    driveType:     row.drive_type,
    serial:        row.serial ?? undefined,
    isBoot:        row.is_boot,
    vmPassthrough: row.vm_passthrough ?? undefined,
    interfaceType: row.interface_type ?? undefined,
    createdAt:     row.created_at,
  };
}

function toPool(row) {
  let vdevGroups = [];
  try {
    vdevGroups = typeof row.vdev_groups === 'string'
      ? JSON.parse(row.vdev_groups)
      : (row.vdev_groups ?? []);
  } catch { vdevGroups = []; }
  return {
    id:         row.id,
    orgId:      row.org_id,
    siteId:     row.site_id,
    deviceId:   row.device_id,
    name:       row.name,
    color:      row.color,
    poolType:   row.pool_type,
    raidLevel:  row.raid_level,
    vdevGroups,
    health:     row.health ?? 'unknown',
    notes:      row.notes ?? undefined,
    createdAt:  row.created_at,
  };
}

function toShare(row) {
  let accessList = [];
  try {
    accessList = typeof row.access_list === 'string'
      ? JSON.parse(row.access_list)
      : (row.access_list ?? []);
  } catch { accessList = []; }
  return {
    id:         row.id,
    orgId:      row.org_id,
    siteId:     row.site_id,
    poolId:     row.pool_id ?? undefined,
    name:       row.name,
    protocol:   row.protocol,
    path:       row.path ?? undefined,
    accessMode: row.access_mode ?? 'public',
    accessList,
    notes:      row.notes ?? undefined,
    createdAt:  row.created_at,
  };
}

module.exports = function storageRoutes(db) {
  const router = express.Router({ mergeParams: true });

  // ── External drives: resolve connection graph to find drives in connected JBODs/DAS ──
  router.get('/:siteId/devices/:deviceId/external-drives', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId, deviceId } = req.params;
    try {
      const result = await withOrg(db, orgId, async c => {
        // Find devices connected to this device (directly connected peers)
        const connResult = await c.query(
          `SELECT DISTINCT
             CASE WHEN src_device_id = $1 THEN dst_device_id ELSE src_device_id END AS peer_id
           FROM connections
           WHERE site_id = $2 AND org_id = $3
             AND (src_device_id = $1 OR dst_device_id = $1)
             AND dst_device_id IS NOT NULL`,
          [deviceId, siteId, orgId]
        );
        const peerIds = connResult.rows.map(r => r.peer_id).filter(Boolean);
        if (peerIds.length === 0) return [];

        // Get drives belonging to those connected devices
        const driveResult = await c.query(
          `SELECT d.*, di.name AS source_device_name
           FROM drives d
           JOIN device_instances di ON di.id = d.device_id
           WHERE d.site_id = $1 AND d.org_id = $2
             AND d.device_id = ANY($3)
           ORDER BY d.device_id, d.created_at`,
          [siteId, orgId, peerIds]
        );
        return driveResult.rows;
      });
      res.json(result.map(row => ({
        ...toDrive(row),
        sourceDeviceName: row.source_device_name,
      })));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/devices/${deviceId}/external-drives]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.get('/:siteId/drives', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM drives WHERE site_id = $1 AND org_id = $2 ORDER BY created_at`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toDrive));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/drives]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.get('/:siteId/drives/inventory', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM drives WHERE site_id = $1 AND org_id = $2 AND device_id IS NULL ORDER BY created_at`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toDrive));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/drives/inventory]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.patch(
    '/:siteId/drives/:driveId/assign',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, driveId } = req.params;
      const { deviceId, slotBlockId } = req.body;
      if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE drives SET device_id = $1, slot_block_id = $2
             WHERE id = $3 AND site_id = $4 AND org_id = $5
             RETURNING *`,
            [deviceId, slotBlockId ?? null, driveId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'drive not found' });
        res.json(toDrive(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/drives/${driveId}/assign]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/drives/:driveId/unassign',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, driveId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE drives SET device_id = NULL, slot_block_id = NULL
             WHERE id = $1 AND site_id = $2 AND org_id = $3
             RETURNING *`,
            [driveId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'drive not found' });
        res.json(toDrive(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/drives/${driveId}/unassign]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.post(
    '/:siteId/drives',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(DriveSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { deviceId, slotBlockId, label, model, capacity, driveType, serial, poolId, isBoot, vmPassthrough, interfaceType } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO drives
               (org_id, site_id, device_id, pool_id, slot_block_id, label, model,
                capacity, drive_type, serial, is_boot, vm_passthrough, interface_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING *`,
            [orgId, siteId, deviceId, poolId ?? null, slotBlockId ?? null, label ?? null, model ?? null,
             capacity, driveType, serial ?? null, isBoot ?? false, vmPassthrough ?? null,
             interfaceType ?? null]
          )
        );
        res.status(201).json(toDrive(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/drives]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/drives/:driveId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(DriveSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, driveId } = req.params;
      const { deviceId, slotBlockId, label, model, capacity, driveType, serial, poolId, isBoot, vmPassthrough, interfaceType } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE drives
             SET device_id = $1, pool_id = $2, slot_block_id = $3, label = $4, model = $5,
                 capacity = $6, drive_type = $7, serial = $8, is_boot = $9, vm_passthrough = $10,
                 interface_type = $11
             WHERE id = $12 AND site_id = $13 AND org_id = $14
             RETURNING *`,
            [deviceId, poolId ?? null, slotBlockId ?? null, label ?? null, model ?? null,
             capacity, driveType, serial ?? null, isBoot ?? false, vmPassthrough ?? null,
             interfaceType ?? null, driveId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'drive not found' });
        res.json(toDrive(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/drives/${driveId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/drives/:driveId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, driveId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM drives WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
            [driveId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'drive not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/drives/${driveId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get('/:siteId/pools', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM storage_pools WHERE site_id = $1 AND org_id = $2 ORDER BY name`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toPool));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/pools]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/:siteId/pools',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(PoolSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { deviceId, name, color, poolType, raidLevel, vdevGroups, health, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO storage_pools
               (org_id, site_id, device_id, name, color, pool_type, raid_level, vdev_groups, health, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING *`,
            [orgId, siteId, deviceId, name, color ?? '#4a8fc4', poolType,
             raidLevel ?? 'stripe', JSON.stringify(vdevGroups ?? []), health ?? 'unknown', notes ?? null]
          )
        );
        res.status(201).json(toPool(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/pools]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/pools/:poolId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(PoolSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, poolId } = req.params;
      const { deviceId, name, color, poolType, raidLevel, vdevGroups, health, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE storage_pools
             SET device_id = $1, name = $2, color = $3, pool_type = $4,
                 raid_level = $5, vdev_groups = $6, health = $7, notes = $8
             WHERE id = $9 AND site_id = $10 AND org_id = $11
             RETURNING *`,
            [deviceId, name, color ?? '#4a8fc4', poolType,
             raidLevel ?? 'stripe', JSON.stringify(vdevGroups ?? []), health ?? 'unknown', notes ?? null,
             poolId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'pool not found' });
        res.json(toPool(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/pools/${poolId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/pools/:poolId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, poolId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM storage_pools WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
            [poolId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'pool not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/pools/${poolId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get('/:siteId/shares', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM shares WHERE site_id = $1 AND org_id = $2 ORDER BY name`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toShare));
    } catch (err) {
      console.error(`[GET /api/sites/${siteId}/shares]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/:siteId/shares',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(ShareSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { poolId, name, protocol, path, accessMode, accessList, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO shares (org_id, site_id, pool_id, name, protocol, path, access_mode, access_list, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING *`,
            [orgId, siteId, poolId ?? null, name, protocol, path ?? null,
             accessMode ?? 'public', JSON.stringify(accessList ?? []), notes ?? null]
          )
        );
        res.status(201).json(toShare(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/shares]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/shares/:shareId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(ShareSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, shareId } = req.params;
      const { poolId, name, protocol, path, accessMode, accessList, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE shares
             SET pool_id = $1, name = $2, protocol = $3, path = $4,
                 access_mode = $5, access_list = $6, notes = $7
             WHERE id = $8 AND site_id = $9 AND org_id = $10
             RETURNING *`,
            [poolId ?? null, name, protocol, path ?? null,
             accessMode ?? 'public', JSON.stringify(accessList ?? []), notes ?? null,
             shareId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'share not found' });
        res.json(toShare(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/shares/${shareId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/shares/:shareId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, shareId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM shares WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
            [shareId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'share not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/shares/${shareId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
