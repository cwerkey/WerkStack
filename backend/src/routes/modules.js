'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const ModuleInstanceSchema = z.object({
  slotBlockId:    z.string().uuid(),
  cardTemplateId: z.string().uuid(),
  serialNumber:   z.string().max(200).optional(),
  assetTag:       z.string().max(200).optional(),
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

function toModule(row) {
  return {
    id:             row.id,
    deviceId:       row.device_id,
    slotBlockId:    row.slot_block_id,
    cardTemplateId: row.card_template_id,
    serialNumber:   row.serial_number,
    assetTag:       row.asset_tag,
    createdAt:      row.created_at,
  };
}

module.exports = function modulesRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth, requireSiteAccess(db));

  router.get('/:siteId/devices/:deviceId/modules', async (req, res, next) => {
    try {
      const { deviceId } = req.params;
      const rows = await withOrg(db, req.orgId, async (client) => {
        const { rows } = await client.query(
          `SELECT m.* FROM module_instances m
             JOIN device_instances d ON d.id = m.device_id
            WHERE m.device_id = $1 AND d.site_id = $2
            ORDER BY m.created_at`,
          [deviceId, req.params.siteId]
        );
        return rows;
      });
      res.json(rows.map(toModule));
    } catch (err) { next(err); }
  });

  router.post('/:siteId/devices/:deviceId/modules', validate(ModuleInstanceSchema), async (req, res, next) => {
    try {
      const { deviceId } = req.params;
      const { slotBlockId, cardTemplateId, serialNumber, assetTag } = req.body;

      const row = await withOrg(db, req.orgId, async (client) => {
        const devCheck = await client.query(
          `SELECT id FROM device_instances WHERE id = $1 AND site_id = $2`,
          [deviceId, req.params.siteId]
        );
        if (devCheck.rows.length === 0) {
          const err = new Error('device not found in this site');
          err.status = 404;
          throw err;
        }

        const slotCheck = await client.query(
          `SELECT id FROM module_instances WHERE device_id = $1 AND slot_block_id = $2`,
          [deviceId, slotBlockId]
        );
        if (slotCheck.rows.length > 0) {
          const err = new Error('slot already occupied');
          err.status = 409;
          throw err;
        }

        const { rows } = await client.query(
          `INSERT INTO module_instances (device_id, slot_block_id, card_template_id, serial_number, asset_tag)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [deviceId, slotBlockId, cardTemplateId, serialNumber ?? null, assetTag ?? null]
        );
        return rows[0];
      });

      res.status(201).json(toModule(row));
    } catch (err) { next(err); }
  });

  router.delete('/:siteId/devices/:deviceId/modules/:moduleId', async (req, res, next) => {
    try {
      const { deviceId, moduleId } = req.params;

      await withOrg(db, req.orgId, async (client) => {
        const devCheck = await client.query(
          `SELECT id FROM device_instances WHERE id = $1 AND site_id = $2`,
          [deviceId, req.params.siteId]
        );
        if (devCheck.rows.length === 0) {
          const err = new Error('device not found in this site');
          err.status = 404;
          throw err;
        }

        const result = await client.query(
          `DELETE FROM module_instances WHERE id = $1 AND device_id = $2`,
          [moduleId, deviceId]
        );
        if (result.rowCount === 0) {
          const err = new Error('module not found');
          err.status = 404;
          throw err;
        }
      });

      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
