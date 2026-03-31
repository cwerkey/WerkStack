'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const TaxonomySchema = z.object({
  category:    z.enum(['vlan', 'device-role', 'app-status']),
  referenceId: z.string().min(1).max(200),
  colorHex:    z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#888888'),
  iconSlug:    z.string().max(100).optional().nullable(),
});

const TaxonomyPatchSchema = z.object({
  referenceId: z.string().min(1).max(200).optional(),
  colorHex:    z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  iconSlug:    z.string().max(100).optional().nullable(),
});

function toTaxonomy(row) {
  return {
    id:          row.id,
    orgId:       row.org_id,
    siteId:      row.site_id,
    category:    row.category,
    referenceId: row.reference_id,
    colorHex:    row.color_hex,
    iconSlug:    row.icon_slug,
    createdAt:   row.created_at,
  };
}

async function withOrg(db, orgId, fn) {
  const client = await db.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

module.exports = function taxonomiesRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  router.get('/', async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    try {
      const result = await withOrg(db, orgId, (c) =>
        c.query(
          `SELECT * FROM taxonomies
           WHERE site_id = $1 AND org_id = $2
           ORDER BY category, reference_id`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toTaxonomy));
    } catch (err) {
      console.error('[GET /taxonomies]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post('/', validate(TaxonomySchema), async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    const { category, referenceId, colorHex, iconSlug } = req.body;
    try {
      const result = await withOrg(db, orgId, (c) =>
        c.query(
          `INSERT INTO taxonomies
             (org_id, site_id, category, reference_id, color_hex, icon_slug)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [orgId, siteId, category, referenceId, colorHex ?? '#888888', iconSlug ?? null]
        )
      );
      res.status(201).json(toTaxonomy(result.rows[0]));
    } catch (err) {
      console.error('[POST /taxonomies]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.patch('/:id', validate(TaxonomyPatchSchema), async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    const { referenceId, colorHex, iconSlug } = req.body;
    try {
      const result = await withOrg(db, orgId, (c) =>
        c.query(
          `UPDATE taxonomies
           SET reference_id = COALESCE($1, reference_id),
               color_hex    = COALESCE($2, color_hex),
               icon_slug    = COALESCE($3, icon_slug)
           WHERE id = $4 AND site_id = $5 AND org_id = $6
           RETURNING *`,
          [referenceId ?? null, colorHex ?? null, iconSlug ?? null, id, siteId, orgId]
        )
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'taxonomy not found' });
      }
      res.json(toTaxonomy(result.rows[0]));
    } catch (err) {
      console.error('[PATCH /taxonomies]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    try {
      const result = await withOrg(db, orgId, (c) =>
        c.query(
          `DELETE FROM taxonomies
           WHERE id = $1 AND site_id = $2 AND org_id = $3
           RETURNING id`,
          [id, siteId, orgId]
        )
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'taxonomy not found' });
      }
      res.status(204).end();
    } catch (err) {
      console.error('[DELETE /taxonomies]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
