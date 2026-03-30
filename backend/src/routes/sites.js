'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const SiteSchema = z.object({
  name:        z.string().min(1).max(100),
  location:    z.string().min(1).max(200),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().max(500).optional(),
});

const ZoneSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
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

function toSite(row) {
  return {
    id:          row.id,
    orgId:       row.org_id,
    name:        row.name,
    location:    row.location,
    color:       row.color,
    description: row.description,
    createdAt:   row.created_at,
  };
}

function toZone(row) {
  return {
    id:          row.id,
    orgId:       row.org_id,
    siteId:      row.site_id,
    name:        row.name,
    description: row.description,
    createdAt:   row.created_at,
  };
}

module.exports = function sitesRoutes(db) {
  const router = express.Router({ mergeParams: true });

  router.use((req, _res, next) => { req.db = db; next(); });

  router.get('/', requireAuth, async (req, res) => {
    const { orgId } = req.user;
    try {
      const result = await withOrg(db, orgId, (c) =>
        c.query(
          `SELECT * FROM sites WHERE org_id = $1 ORDER BY created_at`,
          [orgId]
        )
      );
      res.json(result.rows.map(toSite));
    } catch (err) {
      console.error('[GET /api/sites]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post('/', requireAuth, requireRole('admin'), validate(SiteSchema), async (req, res) => {
    const { orgId } = req.user;
    const { name, location, color, description } = req.body;
    try {
      const result = await withOrg(db, orgId, (c) =>
        c.query(
          `INSERT INTO sites (org_id, name, location, color, description)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [orgId, name, location, color, description ?? null]
        )
      );
      res.status(201).json(toSite(result.rows[0]));
    } catch (err) {
      console.error('[POST /api/sites]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.patch(
    '/:siteId',
    requireAuth,
    requireSiteAccess(db),
    requireRole('admin'),
    validate(SiteSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { name, location, color, description } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `UPDATE sites
             SET name = $1, location = $2, color = $3, description = $4
             WHERE id = $5 AND org_id = $6
             RETURNING *`,
            [name, location, color, description ?? null, siteId, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'site not found' });
        }
        res.json(toSite(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId',
    requireAuth,
    requireSiteAccess(db),
    requireRole('admin'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      try {
        await withOrg(db, orgId, (c) =>
          c.query(
            `DELETE FROM sites WHERE id = $1 AND org_id = $2`,
            [siteId, orgId]
          )
        );
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get(
    '/:siteId/zones',
    requireAuth,
    requireSiteAccess(db),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `SELECT * FROM zones WHERE site_id = $1 AND org_id = $2 ORDER BY created_at`,
            [siteId, orgId]
          )
        );
        res.json(result.rows.map(toZone));
      } catch (err) {
        console.error(`[GET /api/sites/${siteId}/zones]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.post(
    '/:siteId/zones',
    requireAuth,
    requireSiteAccess(db),
    requireRole('admin'),
    validate(ZoneSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { name, description } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `INSERT INTO zones (org_id, site_id, name, description)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [orgId, siteId, name, description ?? null]
          )
        );
        res.status(201).json(toZone(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/sites/${siteId}/zones]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/zones/:zoneId',
    requireAuth,
    requireSiteAccess(db),
    requireRole('admin'),
    validate(ZoneSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, zoneId } = req.params;
      const { name, description } = req.body;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `UPDATE zones
             SET name = $1, description = $2
             WHERE id = $3 AND site_id = $4 AND org_id = $5
             RETURNING *`,
            [name, description ?? null, zoneId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'zone not found' });
        }
        res.json(toZone(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/sites/${siteId}/zones/${zoneId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/zones/:zoneId',
    requireAuth,
    requireSiteAccess(db),
    requireRole('admin'),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId, zoneId } = req.params;
      try {
        const result = await withOrg(db, orgId, (c) =>
          c.query(
            `DELETE FROM zones WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
            [zoneId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'zone not found' });
        }
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/sites/${siteId}/zones/${zoneId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
