'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ── Validation schemas ────────────────────────────────────────────────────────

const DriveSchema = z.object({
  deviceId:      z.string().uuid(),
  slotBlockId:   z.string().max(200).optional(),
  label:         z.string().max(200).optional(),
  capacity:      z.string().min(1).max(50),
  driveType:     z.enum(['hdd', 'ssd', 'nvme', 'flash', 'tape']),
  serial:        z.string().max(200).optional(),
  poolId:        z.string().uuid().optional(),
  isBoot:        z.boolean().default(false),
  vmPassthrough: z.string().max(200).optional(),
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
  notes:      z.string().max(2000).optional(),
});

const ShareSchema = z.object({
  poolId:   z.string().uuid().optional(),
  name:     z.string().min(1).max(200),
  protocol: z.enum(['smb', 'nfs', 'iscsi']),
  path:     z.string().max(500).optional(),
  notes:    z.string().max(2000).optional(),
});

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

function toDrive(row) {
  return {
    id:            row.id,
    orgId:         row.org_id,
    siteId:        row.site_id,
    deviceId:      row.device_id,
    poolId:        row.pool_id ?? undefined,
    slotBlockId:   row.slot_block_id ?? undefined,
    label:         row.label ?? undefined,
    capacity:      row.capacity,
    driveType:     row.drive_type,
    serial:        row.serial ?? undefined,
    isBoot:        row.is_boot,
    vmPassthrough: row.vm_passthrough ?? undefined,
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
    notes:      row.notes ?? undefined,
    createdAt:  row.created_at,
  };
}

function toShare(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    poolId:    row.pool_id ?? undefined,
    name:      row.name,
    protocol:  row.protocol,
    path:      row.path ?? undefined,
    notes:     row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

module.exports = function storageRoutes(db) {
  const router = express.Router({ mergeParams: true });

  // ═══════════════════════════════════════════════════════════════════════════
  // DRIVES — /api/sites/:siteId/drives
  // ═══════════════════════════════════════════════════════════════════════════

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

  router.post(
    '/:siteId/drives',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(DriveSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { deviceId, slotBlockId, label, capacity, driveType, serial, poolId, isBoot, vmPassthrough } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO drives
               (org_id, site_id, device_id, pool_id, slot_block_id, label,
                capacity, drive_type, serial, is_boot, vm_passthrough)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [orgId, siteId, deviceId, poolId ?? null, slotBlockId ?? null, label ?? null,
             capacity, driveType, serial ?? null, isBoot ?? false, vmPassthrough ?? null]
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
      const { deviceId, slotBlockId, label, capacity, driveType, serial, poolId, isBoot, vmPassthrough } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE drives
             SET device_id = $1, pool_id = $2, slot_block_id = $3, label = $4,
                 capacity = $5, drive_type = $6, serial = $7, is_boot = $8, vm_passthrough = $9
             WHERE id = $10 AND site_id = $11 AND org_id = $12
             RETURNING *`,
            [deviceId, poolId ?? null, slotBlockId ?? null, label ?? null,
             capacity, driveType, serial ?? null, isBoot ?? false, vmPassthrough ?? null,
             driveId, siteId, orgId]
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STORAGE POOLS — /api/sites/:siteId/pools
  // ═══════════════════════════════════════════════════════════════════════════

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
      const { deviceId, name, color, poolType, raidLevel, vdevGroups, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO storage_pools
               (org_id, site_id, device_id, name, color, pool_type, raid_level, vdev_groups, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING *`,
            [orgId, siteId, deviceId, name, color ?? '#4a8fc4', poolType,
             raidLevel ?? 'stripe', JSON.stringify(vdevGroups ?? []), notes ?? null]
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
      const { deviceId, name, color, poolType, raidLevel, vdevGroups, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE storage_pools
             SET device_id = $1, name = $2, color = $3, pool_type = $4,
                 raid_level = $5, vdev_groups = $6, notes = $7
             WHERE id = $8 AND site_id = $9 AND org_id = $10
             RETURNING *`,
            [deviceId, name, color ?? '#4a8fc4', poolType,
             raidLevel ?? 'stripe', JSON.stringify(vdevGroups ?? []), notes ?? null,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARES — /api/sites/:siteId/shares
  // ═══════════════════════════════════════════════════════════════════════════

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
      const { poolId, name, protocol, path, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO shares (org_id, site_id, pool_id, name, protocol, path, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING *`,
            [orgId, siteId, poolId ?? null, name, protocol, path ?? null, notes ?? null]
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
      const { poolId, name, protocol, path, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE shares
             SET pool_id = $1, name = $2, protocol = $3, path = $4, notes = $5
             WHERE id = $6 AND site_id = $7 AND org_id = $8
             RETURNING *`,
            [poolId ?? null, name, protocol, path ?? null, notes ?? null,
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
