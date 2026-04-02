'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const RackSchema = z.object({
  name:             z.string().min(1).max(100),
  zoneId:           z.string().uuid().optional(),
  uHeight:          z.number().int().min(1).max(100),
  powerBudgetWatts: z.number().int().min(1).optional().nullable(),
});

const DeviceInstanceSchema = z.object({
  templateId:    z.string().uuid().optional(),
  typeId:        z.string().min(1),
  name:          z.string().min(1).max(200),
  rackId:        z.string().uuid().optional(),
  zoneId:        z.string().uuid().optional(),
  rackU:         z.number().int().min(1).optional(),
  uHeight:       z.number().int().min(1).optional(),
  face:          z.enum(['front', 'rear']).default('front'),
  ip:            z.string().max(200).optional(),
  serial:        z.string().max(200).optional(),
  assetTag:      z.string().max(200).optional(),
  notes:         z.string().max(2000).optional(),
  isDraft:       z.boolean().default(false),
  shelfDeviceId: z.string().uuid().optional(),
  shelfCol:      z.number().int().min(0).optional(),
  shelfRow:      z.number().int().min(0).optional(),
  switchRole:    z.enum(['core', 'edge', 'access', 'unclassified']).optional(),
  isGateway:     z.boolean().optional(),
  portOverrides: z.record(z.string(), z.object({
    label: z.string().max(200).optional(),
    speed: z.string().max(50).optional(),
    mac:   z.string().max(50).optional(),
  })).optional(),
  slotOverrides: z.record(z.string(), z.object({
    label:          z.string().max(200).optional(),
    interfaceTypes: z.array(z.enum(['sata', 'sas', 'nvme', 'u2'])).optional(),
  })).optional(),
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

function toRack(row) {
  return {
    id:               row.id,
    orgId:            row.org_id,
    siteId:           row.site_id,
    zoneId:           row.zone_id,
    name:             row.name,
    uHeight:          row.u_height,
    powerBudgetWatts: row.power_budget_watts ?? undefined,
    createdAt:        row.created_at,
  };
}

function toDevice(row) {
  return {
    id:             row.id,
    orgId:          row.org_id,
    siteId:         row.site_id,
    zoneId:         row.zone_id,
    rackId:         row.rack_id,
    templateId:     row.template_id,
    typeId:         row.type_id,
    name:           row.name,
    rackU:          row.rack_u,
    uHeight:        row.u_height,
    face:           row.face,
    ip:             row.ip,
    serial:         row.serial,
    assetTag:       row.asset_tag,
    notes:          row.notes,
    isDraft:        row.is_draft,
    currentStatus:  row.current_status ?? undefined,
    shelfDeviceId:  row.shelf_device_id ?? undefined,
    shelfCol:       row.shelf_col ?? undefined,
    shelfRow:       row.shelf_row ?? undefined,
    switchRole:     row.switch_role ?? 'unclassified',
    isGateway:      row.is_gateway ?? false,
    portOverrides:  row.port_overrides ?? {},
    slotOverrides:  row.slot_overrides ?? {},
    createdAt:      row.created_at,
  };
}

function hasRackCollision(devices, rackU, uHeight, face, excludeId) {
  const top = rackU;
  const bottom = rackU + uHeight - 1;
  return devices.some(d => {
    if (d.id === excludeId) return false;
    if (d.face !== face) return false;
    if (!d.rackU || !d.uHeight) return false;
    const dTop = d.rackU;
    const dBottom = d.rackU + d.uHeight - 1;
    return top <= dBottom && bottom >= dTop;
  });
}

module.exports = function racksRoutes(db) {
  const router = express.Router({ mergeParams: true });

  router.get(
    '/:siteId/racks',
    requireAuth,
    requireSiteAccess(db),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `SELECT * FROM racks WHERE site_id = $1 AND org_id = $2 ORDER BY name`,
            [siteId, orgId]
          )
        );
        res.json(result.rows.map(toRack));
      } catch (err) {
        console.error(`[GET /api/sites/${siteId}/racks]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.post(
    '/:siteId/racks',
    requireAuth,
    requireSiteAccess(db),
    requireRole('admin'),
    validate(RackSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { name, zoneId, uHeight, powerBudgetWatts } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `INSERT INTO racks (org_id, site_id, zone_id, name, u_height, power_budget_watts)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [orgId, siteId, zoneId ?? null, name, uHeight, powerBudgetWatts ?? null]
          )
        );
        res.status(201).json(toRack(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/racks]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/racks/:rackId',
    requireAuth,
    requireSiteAccess(db),
    requireRole('admin'),
    validate(RackSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, rackId } = req.params;
      const { name, zoneId, uHeight, powerBudgetWatts } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `UPDATE racks SET name = $1, zone_id = $2, u_height = $3, power_budget_watts = $4
             WHERE id = $5 AND site_id = $6 AND org_id = $7
             RETURNING *`,
            [name, zoneId ?? null, uHeight, powerBudgetWatts ?? null, rackId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'rack not found' });
        }
        res.json(toRack(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/racks/${rackId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/racks/:rackId',
    requireAuth,
    requireSiteAccess(db),
    requireRole('admin'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, rackId } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `DELETE FROM racks WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
            [rackId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'rack not found' });
        }
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/racks/${rackId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get(
    '/:siteId/devices',
    requireAuth,
    requireSiteAccess(db),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `SELECT * FROM device_instances WHERE site_id = $1 AND org_id = $2 ORDER BY created_at`,
            [siteId, orgId]
          )
        );
        res.json(result.rows.map(toDevice));
      } catch (err) {
        console.error(`[GET /api/sites/${siteId}/devices]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.post(
    '/:siteId/devices',
    requireAuth,
    requireSiteAccess(db),
    requireRole('member'),
    validate(DeviceInstanceSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { templateId, typeId, name, rackId, zoneId, rackU, uHeight, face, ip, serial, assetTag, notes, isDraft, shelfDeviceId, shelfCol, shelfRow, switchRole, isGateway, portOverrides, slotOverrides } = req.body;

      try {
        if (rackId && rackU && uHeight) {
          const existing = await withOrg(db, orgId, (c) =>
            c.query(
              `SELECT id, rack_u, u_height, face FROM device_instances
               WHERE rack_id = $1 AND org_id = $2 AND rack_u IS NOT NULL`,
              [rackId, orgId]
            )
          );
          const devices = existing.rows.map(toDevice);
          if (hasRackCollision(devices, rackU, uHeight, face || 'front', null)) {
            return res.status(409).json({ error: 'rack position collision — another device occupies that U range' });
          }
        }

        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `INSERT INTO device_instances
               (org_id, site_id, zone_id, rack_id, template_id, type_id, name, rack_u, u_height, face, ip, serial, asset_tag, notes, is_draft, shelf_device_id, shelf_col, shelf_row, switch_role, is_gateway, port_overrides, slot_overrides)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
             RETURNING *`,
            [orgId, siteId, zoneId ?? null, rackId ?? null, templateId ?? null,
             typeId, name, rackU ?? null, uHeight ?? null, face || 'front',
             ip ?? null, serial ?? null, assetTag ?? null, notes ?? null, isDraft ?? false,
             shelfDeviceId ?? null, shelfCol ?? null, shelfRow ?? null,
             switchRole ?? 'unclassified', isGateway ?? false,
             JSON.stringify(portOverrides ?? {}), JSON.stringify(slotOverrides ?? {})]
          )
        );
        res.status(201).json(toDevice(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/devices]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/devices/:deviceId',
    requireAuth,
    requireSiteAccess(db),
    requireRole('member'),
    validate(DeviceInstanceSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, deviceId } = req.params;
      const { templateId, typeId, name, rackId, zoneId, rackU, uHeight, face, ip, serial, assetTag, notes, isDraft, shelfDeviceId, shelfCol, shelfRow, switchRole, isGateway, portOverrides, slotOverrides } = req.body;

      try {
        if (rackId && rackU && uHeight) {
          const existing = await withOrg(db, orgId, (c) =>
            c.query(
              `SELECT id, rack_u, u_height, face FROM device_instances
               WHERE rack_id = $1 AND org_id = $2 AND rack_u IS NOT NULL`,
              [rackId, orgId]
            )
          );
          const devices = existing.rows.map(toDevice);
          if (hasRackCollision(devices, rackU, uHeight, face || 'front', deviceId)) {
            return res.status(409).json({ error: 'rack position collision — another device occupies that U range' });
          }
        }

        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `UPDATE device_instances
             SET template_id = $1, type_id = $2, name = $3, rack_id = $4, zone_id = $5,
                 rack_u = $6, u_height = $7, face = $8, ip = $9, serial = $10,
                 asset_tag = $11, notes = $12, is_draft = $13,
                 shelf_device_id = $14, shelf_col = $15, shelf_row = $16,
                 switch_role = $17, is_gateway = $18,
                 port_overrides = $19, slot_overrides = $20
             WHERE id = $21 AND site_id = $22 AND org_id = $23
             RETURNING *`,
            [templateId ?? null, typeId, name, rackId ?? null, zoneId ?? null,
             rackU ?? null, uHeight ?? null, face || 'front',
             ip ?? null, serial ?? null, assetTag ?? null, notes ?? null, isDraft ?? false,
             shelfDeviceId ?? null, shelfCol ?? null, shelfRow ?? null,
             switchRole ?? 'unclassified', isGateway ?? false,
             JSON.stringify(portOverrides ?? {}), JSON.stringify(slotOverrides ?? {}),
             deviceId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'device not found' });
        }
        res.json(toDevice(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/devices/${deviceId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/devices/:deviceId',
    requireAuth,
    requireSiteAccess(db),
    requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, deviceId } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `DELETE FROM device_instances WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
            [deviceId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'device not found' });
        }
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/devices/${deviceId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  const PositionSchema = z.object({
    rackId:  z.string().uuid(),
    rackU:   z.number().int().min(1),
    face:    z.enum(['front', 'rear']).default('front'),
  });

  router.patch(
    '/:siteId/devices/:deviceId/position',
    requireAuth,
    requireSiteAccess(db),
    requireRole('member'),
    validate(PositionSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, deviceId } = req.params;
      const { rackId, rackU, face } = req.body;

      try {
        const devResult = await withOrg(db, orgId, (c) =>
          c.query(
            `SELECT u_height FROM device_instances WHERE id = $1 AND site_id = $2 AND org_id = $3`,
            [deviceId, siteId, orgId]
          )
        );
        if (devResult.rows.length === 0) {
          return res.status(404).json({ error: 'device not found' });
        }
        const uHeight = devResult.rows[0].u_height;
        if (!uHeight) {
          return res.status(400).json({ error: 'device has no uHeight — cannot position in rack' });
        }

        const existing = await withOrg(db, orgId, (c) =>
          c.query(
            `SELECT id, rack_u, u_height, face FROM device_instances
             WHERE rack_id = $1 AND org_id = $2 AND rack_u IS NOT NULL`,
            [rackId, orgId]
          )
        );
        const devices = existing.rows.map(toDevice);
        if (hasRackCollision(devices, rackU, uHeight, face, deviceId)) {
          return res.status(409).json({ error: 'rack position collision' });
        }

        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `UPDATE device_instances SET rack_id = $1, rack_u = $2, face = $3
             WHERE id = $4 AND site_id = $5 AND org_id = $6
             RETURNING *`,
            [rackId, rackU, face, deviceId, siteId, orgId]
          )
        );
        res.json(toDevice(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH position]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
