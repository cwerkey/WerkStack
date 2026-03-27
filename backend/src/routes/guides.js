'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const GuideSchema = z.object({
  title:   z.string().min(1).max(200),
  content: z.string().max(200000).default(''),
});

function toGuide(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    title:     row.title,
    content:   row.content,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = function guidesRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  // GET /api/sites/:siteId/guides
  router.get('/', async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    try {
      const result = await db.query(
        `SELECT * FROM guides
         WHERE site_id = $1 AND org_id = $2
         ORDER BY updated_at DESC`,
        [siteId, orgId]
      );
      res.json(result.rows.map(toGuide));
    } catch (err) {
      console.error('[GET /guides]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /api/sites/:siteId/guides
  router.post('/', validate(GuideSchema), async (req, res) => {
    const { siteId }        = req.params;
    const { orgId, userId } = req.user;
    const { title, content } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO guides (org_id, site_id, title, content, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [orgId, siteId, title, content ?? '', userId]
      );
      res.status(201).json(toGuide(result.rows[0]));
    } catch (err) {
      console.error('[POST /guides]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /api/sites/:siteId/guides/:id — update title and/or content
  router.patch('/:id', validate(GuideSchema), async (req, res) => {
    const { siteId, id }     = req.params;
    const { orgId }          = req.user;
    const { title, content } = req.body;
    try {
      const result = await db.query(
        `UPDATE guides
         SET title      = $1,
             content    = $2,
             updated_at = now()
         WHERE id = $3 AND site_id = $4 AND org_id = $5
         RETURNING *`,
        [title, content, id, siteId, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'guide not found' });
      res.json(toGuide(result.rows[0]));
    } catch (err) {
      console.error('[PATCH /guides/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // DELETE /api/sites/:siteId/guides/:id — admin+ only
  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    try {
      const result = await db.query(
        `DELETE FROM guides WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
        [id, siteId, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'guide not found' });
      res.status(204).end();
    } catch (err) {
      console.error('[DELETE /guides/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
