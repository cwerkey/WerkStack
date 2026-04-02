'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const PlacedBlockSchema = z.object({
  id:      z.string().uuid(),
  type:    z.string(),
  col:     z.number(),
  row:     z.number(),
  w:       z.number().positive(),
  h:       z.number().positive(),
  label:   z.string().optional(),
  rotated: z.boolean().optional(),
  slot:    z.union([z.literal(0), z.literal(1)]).optional(),
  meta:    z.record(z.unknown()).optional(),
});

const GridLayoutSchema = z.object({
  front: z.array(PlacedBlockSchema),
  rear:  z.array(PlacedBlockSchema),
});

const DeviceTemplateSchema = z.object({
  manufacturer: z.string().max(200).optional(),
  make:       z.string().min(1).max(200),
  model:      z.string().min(1).max(200),
  category:   z.string().min(1).max(100),
  formFactor: z.enum(['rack', 'desktop', 'wall-mount']),
  uHeight:    z.number().int().min(1).max(100),
  gridCols:   z.number().int().positive().optional(),
  gridRows:   z.number().int().positive().optional(),
  wattageMax: z.number().positive().optional(),
  layout:     GridLayoutSchema,
  imageUrl:   z.string().url().optional(),
  isShelf:    z.boolean().default(false),
});

const PcieTemplateSchema = z.object({
  manufacturer: z.string().max(200).optional(),
  make:       z.string().min(1).max(200),
  model:      z.string().min(1).max(200),
  busSize:    z.enum(['x1', 'x4', 'x8', 'x16']),
  formFactor: z.enum(['fh', 'lp', 'dw']),
  laneDepth:  z.number().int().min(1).default(1),
  layout:     z.object({ rear: z.array(PlacedBlockSchema) }),
});

const TemplateImportSchema = z.object({
  schema_version: z.literal('2'),
  metadata: z.object({
    make:        z.string(),
    model:       z.string(),
    category:    z.string().optional(),
    form_factor: z.enum(['rack', 'desktop', 'wall-mount']).optional(),
    u_height:    z.number().optional(),
    wattage_max: z.number().optional(),
  }),
  layout: z.object({
    front: z.array(z.record(z.unknown())),
    rear:  z.array(z.record(z.unknown())),
  }),
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

function toDeviceTemplate(row) {
  return {
    id:           row.id,
    orgId:        row.org_id,
    manufacturer: row.manufacturer ?? undefined,
    make:         row.make,
    model:        row.model,
    category:     row.category,
    formFactor:   row.form_factor,
    uHeight:      row.u_height,
    gridCols:     row.grid_cols,
    gridRows:     row.grid_rows,
    wattageMax:   row.wattage_max,
    layout:       typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout,
    imageUrl:     row.image_url,
    isShelf:      row.is_shelf,
    createdAt:    row.created_at,
  };
}

function toPcieTemplate(row) {
  return {
    id:           row.id,
    orgId:        row.org_id,
    manufacturer: row.manufacturer ?? undefined,
    make:         row.make,
    model:        row.model,
    busSize:      row.bus_size,
    formFactor:   row.form_factor,
    laneDepth:    row.lane_depth,
    layout:       typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout,
    createdAt:    row.created_at,
  };
}

function hasCollision(blocks, col, row, w, h, excludeId) {
  return blocks.some(b => {
    if (b.id === excludeId) return false;
    const bw = b.rotated ? b.h : b.w;
    const bh = b.rotated ? b.w : b.h;
    return col < b.col + bw && col + w > b.col && row < b.row + bh && row + h > b.row;
  });
}

module.exports = function templatesRoutes(db) {
  const router = express.Router({ mergeParams: true });

  router.get('/devices', requireAuth, async (req, res) => {
    const { orgId } = req.user;
    try {
      const result = await withOrg(db, orgId, (c) =>
        c.query(
          `SELECT * FROM device_templates WHERE org_id = $1 ORDER BY created_at DESC`,
          [orgId]
        )
      );
      res.json(result.rows.map(toDeviceTemplate));
    } catch (err) {
      console.error('[GET /api/templates/devices]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/devices',
    requireAuth,
    requireRole('member'),
    validate(DeviceTemplateSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { manufacturer, make, model, category, formFactor, uHeight, gridCols, gridRows, wattageMax, layout, imageUrl, isShelf } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `INSERT INTO device_templates
             (org_id, manufacturer, make, model, category, form_factor, u_height, grid_cols, grid_rows, wattage_max, layout, image_url, is_shelf)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [orgId, manufacturer ?? null, make, model, category, formFactor, uHeight, gridCols ?? null, gridRows ?? null, wattageMax ?? null, JSON.stringify(layout), imageUrl ?? null, isShelf]
          )
        );
        res.status(201).json(toDeviceTemplate(result.rows[0]));
      } catch (err) {
        console.error('[POST /api/templates/devices]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/devices/:id',
    requireAuth,
    requireRole('member'),
    validate(DeviceTemplateSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { id } = req.params;
      const { manufacturer, make, model, category, formFactor, uHeight, gridCols, gridRows, wattageMax, layout, imageUrl, isShelf } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `UPDATE device_templates
             SET manufacturer = $1, make = $2, model = $3, category = $4, form_factor = $5, u_height = $6,
                 grid_cols = $7, grid_rows = $8, wattage_max = $9, layout = $10,
                 image_url = $11, is_shelf = $12
             WHERE id = $13 AND org_id = $14
             RETURNING *`,
            [manufacturer ?? null, make, model, category, formFactor, uHeight, gridCols ?? null, gridRows ?? null, wattageMax ?? null, JSON.stringify(layout), imageUrl ?? null, isShelf, id, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'template not found' });
        }
        res.json(toDeviceTemplate(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/templates/devices/${id}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/devices/:id',
    requireAuth,
    requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { id } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `DELETE FROM device_templates WHERE id = $1 AND org_id = $2 RETURNING id`,
            [id, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'template not found' });
        }
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/templates/devices/${id}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get(
    '/devices/:id/usage',
    requireAuth,
    async (req, res) => {
      const { orgId } = req.user;
      const { id } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `SELECT COUNT(*)::int AS count FROM device_instances WHERE template_id = $1 AND org_id = $2`,
            [id, orgId]
          )
        );
        res.json({ count: result.rows[0]?.count ?? 0 });
      } catch (err) {
        console.error(`[GET /api/templates/devices/${id}/usage]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.post(
    '/devices/import',
    requireAuth,
    requireRole('member'),
    validate(TemplateImportSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { metadata, layout } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `INSERT INTO device_templates
             (org_id, make, model, category, form_factor, u_height, wattage_max, layout, is_shelf)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
             RETURNING *`,
            [
              orgId,
              metadata.make,
              metadata.model,
              metadata.category || 'server',
              metadata.form_factor || 'rack',
              metadata.u_height || 1,
              metadata.wattage_max ?? null,
              JSON.stringify(layout),
            ]
          )
        );
        res.status(201).json(toDeviceTemplate(result.rows[0]));
      } catch (err) {
        console.error('[POST /api/templates/devices/import]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get(
    '/devices/:id/export',
    requireAuth,
    async (req, res) => {
      const { orgId } = req.user;
      const { id } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `SELECT * FROM device_templates WHERE id = $1 AND org_id = $2`,
            [id, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'template not found' });
        }
        const t = toDeviceTemplate(result.rows[0]);
        res.json({
          schema_version: '2',
          metadata: {
            make:        t.make,
            model:       t.model,
            category:    t.category,
            form_factor: t.formFactor,
            u_height:    t.uHeight,
            wattage_max: t.wattageMax,
          },
          layout: t.layout,
        });
      } catch (err) {
        console.error(`[GET /api/templates/devices/${id}/export]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.post(
    '/devices/check-collision',
    requireAuth,
    async (req, res) => {
      const { blocks, col, row, w, h, excludeId } = req.body;
      if (!Array.isArray(blocks) || typeof col !== 'number' || typeof row !== 'number' || typeof w !== 'number' || typeof h !== 'number') {
        return res.status(400).json({ error: 'missing required fields: blocks, col, row, w, h' });
      }
      const collides = hasCollision(blocks, col, row, w, h, excludeId);
      res.json({ collides });
    }
  );

  router.get('/pcie', requireAuth, async (req, res) => {
    const { orgId } = req.user;
    try {
      const result = await withOrg(db, orgId, (c) =>
        c.query(
          `SELECT * FROM pcie_card_templates WHERE org_id = $1 ORDER BY created_at DESC`,
          [orgId]
        )
      );
      res.json(result.rows.map(toPcieTemplate));
    } catch (err) {
      console.error('[GET /api/templates/pcie]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/pcie',
    requireAuth,
    requireRole('member'),
    validate(PcieTemplateSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { manufacturer, make, model, busSize, formFactor, laneDepth, layout } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `INSERT INTO pcie_card_templates
             (org_id, manufacturer, make, model, bus_size, form_factor, lane_depth, layout)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [orgId, manufacturer ?? null, make, model, busSize, formFactor, laneDepth ?? 1, JSON.stringify(layout)]
          )
        );
        res.status(201).json(toPcieTemplate(result.rows[0]));
      } catch (err) {
        console.error('[POST /api/templates/pcie]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/pcie/:id',
    requireAuth,
    requireRole('member'),
    validate(PcieTemplateSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { id } = req.params;
      const { manufacturer, make, model, busSize, formFactor, laneDepth, layout } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `UPDATE pcie_card_templates
             SET manufacturer = $1, make = $2, model = $3, bus_size = $4, form_factor = $5,
                 lane_depth = $6, layout = $7
             WHERE id = $8 AND org_id = $9
             RETURNING *`,
            [manufacturer ?? null, make, model, busSize, formFactor, laneDepth ?? 1, JSON.stringify(layout), id, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'template not found' });
        }
        res.json(toPcieTemplate(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/templates/pcie/${id}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/pcie/:id',
    requireAuth,
    requireRole('member'),
    async (req, res) => {
      const { orgId } = req.user;
      const { id } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `DELETE FROM pcie_card_templates WHERE id = $1 AND org_id = $2 RETURNING id`,
            [id, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'template not found' });
        }
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/templates/pcie/${id}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get('/manufacturers', requireAuth, async (req, res) => {
    const { orgId } = req.user;
    try {
      const result = await withOrg(db, orgId, (c) =>
        c.query(
          `SELECT DISTINCT manufacturer FROM (
             SELECT manufacturer FROM device_templates WHERE org_id = $1 AND manufacturer IS NOT NULL AND manufacturer != ''
             UNION
             SELECT manufacturer FROM pcie_card_templates WHERE org_id = $1 AND manufacturer IS NOT NULL AND manufacturer != ''
           ) combined ORDER BY manufacturer`,
          [orgId]
        )
      );
      res.json(result.rows.map(r => r.manufacturer));
    } catch (err) {
      console.error('[GET /api/templates/manufacturers]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
