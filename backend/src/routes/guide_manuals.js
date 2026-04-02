'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const ManualSchema = z.object({
  name:       z.string().min(1).max(200),
  sort_order: z.number().int().min(0).optional(),
  parent_id:  z.string().uuid().nullable().optional(),
});

const ManualPatchSchema = z.object({
  name:       z.string().min(1).max(200).optional(),
  sort_order: z.number().int().min(0).optional(),
  parent_id:  z.string().uuid().nullable().optional(),
}).refine(d => d.name !== undefined || d.sort_order !== undefined || d.parent_id !== undefined, {
  message: 'at least one field required',
});

function toManual(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    name:      row.name,
    sortOrder: row.sort_order,
    parentId:  row.parent_id ?? null,
    isShared:  row.is_shared ?? false,
    createdAt: row.created_at,
  };
}

module.exports = function guideManualsRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  router.get('/', async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    try {
      const result = await db.query(
        `SELECT * FROM guide_manuals
         WHERE (site_id = $1 OR is_shared = true) AND org_id = $2
         ORDER BY sort_order ASC, created_at ASC`,
        [siteId, orgId]
      );
      res.json(result.rows.map(toManual));
    } catch (err) {
      console.error('[GET /guide-manuals]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post('/', validate(ManualSchema), async (req, res) => {
    const { siteId }                    = req.params;
    const { orgId }                     = req.user;
    const { name, sort_order, parent_id } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO guide_manuals (org_id, site_id, name, sort_order, parent_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [orgId, siteId, name, sort_order ?? 0, parent_id ?? null]
      );
      res.status(201).json(toManual(result.rows[0]));
    } catch (err) {
      console.error('[POST /guide-manuals]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.patch('/:id', validate(ManualPatchSchema), async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    const { name, sort_order, parent_id } = req.body;
    try {
      const sets   = [];
      const values = [];
      let   i      = 1;
      if (name       !== undefined) { sets.push(`name = $${i++}`);       values.push(name); }
      if (sort_order !== undefined) { sets.push(`sort_order = $${i++}`); values.push(sort_order); }
      if (parent_id  !== undefined) { sets.push(`parent_id = $${i++}`);  values.push(parent_id); }
      values.push(id, siteId, orgId);
      const result = await db.query(
        `UPDATE guide_manuals SET ${sets.join(', ')}
         WHERE id = $${i++} AND site_id = $${i++} AND org_id = $${i}
         RETURNING *`,
        values
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'manual not found' });
      res.json(toManual(result.rows[0]));
    } catch (err) {
      console.error('[PATCH /guide-manuals/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    try {
      const result = await db.query(
        `DELETE FROM guide_manuals WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
        [id, siteId, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'manual not found' });
      res.status(204).end();
    } catch (err) {
      console.error('[DELETE /guide-manuals/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
