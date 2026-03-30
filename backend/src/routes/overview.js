'use strict';

const express = require('express');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');

module.exports = function overviewRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  router.get('/', async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    try {
      const [devicesRes, openTicketsRes, stagedRes, powerRes] = await Promise.all([
        db.query(
          `SELECT COUNT(*) FROM device_instances
           WHERE site_id = $1 AND org_id = $2 AND is_draft = false`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT COUNT(*) FROM tickets
           WHERE site_id = $1 AND org_id = $2 AND status != 'closed'`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT COUNT(*) FROM device_instances
           WHERE site_id = $1 AND org_id = $2 AND is_draft = true`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT COALESCE(SUM(dt.wattage_max), 0) AS total_watts
           FROM device_instances di
           JOIN device_templates dt ON dt.id = di.template_id
           WHERE di.site_id = $1 AND di.org_id = $2 AND di.is_draft = false`,
          [siteId, orgId]
        ),
      ]);

      res.json({
        totalDevices:  parseInt(devicesRes.rows[0].count,           10),
        openTickets:   parseInt(openTicketsRes.rows[0].count,       10),
        stagedDevices: parseInt(stagedRes.rows[0].count,            10),
        powerWatts:    parseInt(powerRes.rows[0].total_watts || '0', 10),
      });
    } catch (err) {
      console.error('[GET /sites/:siteId/overview]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
