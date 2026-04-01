'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const VlanSchema = z.object({
  vlanId:   z.number().int().min(1).max(4094),
  name:     z.string().min(1).max(200),
  color:    z.string().min(1).max(20).default('#888888'),
  subnetId: z.string().uuid().optional().nullable(),
  notes:    z.string().max(2000).optional(),
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

function toVlan(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    vlanId:    row.vlan_id,
    name:      row.name,
    color:     row.color,
    subnetId:  row.subnet_id ?? undefined,
    notes:     row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

module.exports = function vlansRoutes(db) {
  const router = express.Router({ mergeParams: true });

  router.get('/:siteId/vlans', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM vlans WHERE site_id = $1 AND org_id = $2 ORDER BY vlan_id`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toVlan));
    } catch (err) {
      console.error('[GET /vlans]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/:siteId/vlans',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(VlanSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { vlanId, name, color, subnetId, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO vlans (org_id, site_id, vlan_id, name, color, subnet_id, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING *`,
            [orgId, siteId, vlanId, name, color ?? '#888888', subnetId ?? null, notes ?? null]
          )
        );
        res.status(201).json(toVlan(result.rows[0]));
      } catch (err) {
        if (err.code === '23505') {
          return res.status(409).json({ error: `VLAN ${vlanId} already exists in this site` });
        }
        console.error('[POST /vlans]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/vlans/:vlanUuid',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(VlanSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, vlanUuid } = req.params;
      const { vlanId, name, color, subnetId, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE vlans
             SET vlan_id=$1, name=$2, color=$3, subnet_id=$4, notes=$5
             WHERE id=$6 AND site_id=$7 AND org_id=$8
             RETURNING *`,
            [vlanId, name, color ?? '#888888', subnetId ?? null, notes ?? null,
             vlanUuid, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'VLAN not found' });
        res.json(toVlan(result.rows[0]));
      } catch (err) {
        if (err.code === '23505') {
          return res.status(409).json({ error: `VLAN ${vlanId} already exists in this site` });
        }
        console.error('[PATCH /vlans]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/vlans/:vlanUuid',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, vlanUuid } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM vlans WHERE id=$1 AND site_id=$2 AND org_id=$3 RETURNING id`,
            [vlanUuid, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'VLAN not found' });
        res.status(204).end();
      } catch (err) {
        console.error('[DELETE /vlans]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
