'use strict';

const express = require('express');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');

const ENTITY_TYPES = ['device', 'pool', 'share', 'subnet', 'host', 'vm', 'app', 'container'];

module.exports = function guidesByEntityRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  // GET /api/sites/:siteId/guides/by-entity/:type/:entityId
  router.get('/by-entity/:type/:entityId', async (req, res) => {
    const { siteId, type, entityId } = req.params;
    const { orgId } = req.user;
    if (!ENTITY_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${ENTITY_TYPES.join(', ')}` });
    }
    try {
      const result = await db.query(
        `SELECT g.id, g.title, g.manual_id, gm.name AS manual_name, g.updated_at
         FROM guide_links gl
         JOIN guides g ON g.id = gl.guide_id
         LEFT JOIN guide_manuals gm ON gm.id = g.manual_id
         WHERE gl.org_id = $1 AND gl.entity_type = $2 AND gl.entity_id = $3 AND g.site_id = $4
         ORDER BY g.updated_at DESC`,
        [orgId, type, entityId, siteId]
      );
      res.json(result.rows.map(r => ({
        id:         r.id,
        title:      r.title,
        manualId:   r.manual_id ?? null,
        manualName: r.manual_name ?? null,
        updatedAt:  r.updated_at,
      })));
    } catch (err) {
      console.error('[GET /guides/by-entity]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
