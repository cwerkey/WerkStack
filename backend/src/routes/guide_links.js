'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const ENTITY_TYPES = ['device', 'pool', 'share', 'subnet', 'host', 'vm', 'app'];

const LinkSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId:   z.string().uuid(),
});

function toLink(row) {
  return {
    id:         row.id,
    orgId:      row.org_id,
    guideId:    row.guide_id,
    entityType: row.entity_type,
    entityId:   row.entity_id,
    createdAt:  row.created_at,
  };
}

function guideLinkQueryRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  router.get('/', async (req, res) => {
    const { siteId }               = req.params;
    const { orgId }                = req.user;
    const { entityType, entityId } = req.query;
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId query params required' });
    }
    if (!ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ error: `entityType must be one of: ${ENTITY_TYPES.join(', ')}` });
    }
    try {
      const result = await db.query(
        `SELECT gl.*, g.title AS guide_title
         FROM guide_links gl
         JOIN guides g ON g.id = gl.guide_id
         WHERE gl.org_id = $1 AND gl.entity_type = $2 AND gl.entity_id = $3
           AND g.site_id = $4`,
        [orgId, entityType, entityId, siteId]
      );
      res.json(result.rows.map(row => ({ ...toLink(row), guideTitle: row.guide_title })));
    } catch (err) {
      console.error('[GET /guide-links]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.get('/counts', async (req, res) => {
    const { siteId }     = req.params;
    const { orgId }      = req.user;
    const { entityType } = req.query;
    if (!entityType || !ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ error: `entityType must be one of: ${ENTITY_TYPES.join(', ')}` });
    }
    try {
      const result = await db.query(
        `SELECT gl.entity_id AS "entityId", COUNT(*)::int AS count
         FROM guide_links gl
         JOIN guides g ON g.id = gl.guide_id
         WHERE gl.org_id = $1 AND gl.entity_type = $2 AND g.site_id = $3
         GROUP BY gl.entity_id`,
        [orgId, entityType, siteId]
      );
      res.json(result.rows);
    } catch (err) {
      console.error('[GET /guide-links/counts]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
}

function guideLinkCrudRoutes(db) {
  const router = express.Router({ mergeParams: true });

  router.post('/:guideId/links', validate(LinkSchema), async (req, res) => {
    const { siteId, guideId }      = req.params;
    const { orgId }                = req.user;
    const { entityType, entityId } = req.body;
    try {
      const check = await db.query(
        `SELECT id FROM guides WHERE id = $1 AND site_id = $2 AND org_id = $3`,
        [guideId, siteId, orgId]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: 'guide not found' });

      const result = await db.query(
        `INSERT INTO guide_links (org_id, guide_id, entity_type, entity_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guide_id, entity_type, entity_id) DO NOTHING
         RETURNING *`,
        [orgId, guideId, entityType, entityId]
      );
      if (result.rows.length === 0) {
        const existing = await db.query(
          `SELECT * FROM guide_links WHERE guide_id = $1 AND entity_type = $2 AND entity_id = $3`,
          [guideId, entityType, entityId]
        );
        return res.status(200).json(toLink(existing.rows[0]));
      }
      res.status(201).json(toLink(result.rows[0]));
    } catch (err) {
      console.error('[POST /guides/:guideId/links]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.delete('/:guideId/links/:linkId', async (req, res) => {
    const { siteId, guideId, linkId } = req.params;
    const { orgId }                   = req.user;
    try {
      const result = await db.query(
        `DELETE FROM guide_links gl
         USING guides g
         WHERE gl.id = $1 AND gl.guide_id = $2 AND gl.org_id = $3
           AND g.id = gl.guide_id AND g.site_id = $4
         RETURNING gl.id`,
        [linkId, guideId, orgId, siteId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'link not found' });
      res.status(204).end();
    } catch (err) {
      console.error('[DELETE /guides/:guideId/links/:linkId]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
}

module.exports = { guideLinkQueryRoutes, guideLinkCrudRoutes };
