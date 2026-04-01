'use strict';

const express = require('express');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');

const DEFAULT_LAYOUT = [
  { widgetKey: 'device-list', x: 0, y: 0, w: 6, h: 4, visible: true },
  { widgetKey: 'network',     x: 6, y: 0, w: 6, h: 4, visible: true },
  { widgetKey: 'storage',     x: 0, y: 4, w: 6, h: 4, visible: true },
  { widgetKey: 'activity',    x: 6, y: 4, w: 6, h: 4, visible: true },
];

module.exports = function overviewRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  // GET /api/sites/:siteId/overview — aggregate KPIs
  router.get('/', async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    try {
      const [devicesRes, openTicketsRes, stagedRes, powerRes, racksRes, drivesRes, subnetsRes, alertsRes] = await Promise.all([
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
        db.query(
          `SELECT COUNT(*) FROM racks WHERE site_id = $1 AND org_id = $2`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT COUNT(*) FROM drives WHERE site_id = $1 AND org_id = $2`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT COUNT(*) FROM subnets WHERE site_id = $1 AND org_id = $2`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT COUNT(*) FROM device_instances
           WHERE site_id = $1 AND org_id = $2
             AND current_status IN ('down', 'degraded')`,
          [siteId, orgId]
        ),
      ]);

      res.json({
        totalDevices:  parseInt(devicesRes.rows[0].count,            10),
        openTickets:   parseInt(openTicketsRes.rows[0].count,        10),
        stagedDevices: parseInt(stagedRes.rows[0].count,             10),
        powerWatts:    parseInt(powerRes.rows[0].total_watts || '0', 10),
        rackCount:     parseInt(racksRes.rows[0].count,              10),
        driveCount:    parseInt(drivesRes.rows[0].count,             10),
        subnetCount:   parseInt(subnetsRes.rows[0].count,            10),
        alertCount:    parseInt(alertsRes.rows[0].count,             10),
      });
    } catch (err) {
      console.error('[GET /sites/:siteId/overview]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /api/sites/:siteId/overview/widgets — widget-specific data
  router.get('/widgets', async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    try {
      const [devicesRes, subnetsRes, ipCountsRes, vlanRes, poolsRes, driveCountRes, activityRes] = await Promise.all([
        db.query(
          `SELECT di.id, di.name, di.ip, di.current_status,
                  di.rack_id, r.zone_id,
                  dt.name AS type_name
           FROM device_instances di
           LEFT JOIN device_types dt ON dt.id = di.type_id
           LEFT JOIN racks r ON r.id = di.rack_id
           WHERE di.site_id = $1 AND di.org_id = $2 AND di.is_draft = false
           ORDER BY di.name
           LIMIT 100`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT id, name, cidr, vlan FROM subnets
           WHERE site_id = $1 AND org_id = $2
           ORDER BY name`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT subnet_id, COUNT(*) AS used_count
           FROM ip_assignments
           WHERE site_id = $1 AND org_id = $2
           GROUP BY subnet_id`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT COUNT(DISTINCT vlan) AS vlan_count
           FROM subnets
           WHERE site_id = $1 AND org_id = $2 AND vlan IS NOT NULL`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT sp.id, sp.name, sp.health, sp.device_id,
                  di.name AS device_name,
                  COUNT(d.id) AS drive_count
           FROM storage_pools sp
           LEFT JOIN device_instances di ON di.id = sp.device_id
           LEFT JOIN drives d ON d.pool_id = sp.id
           WHERE sp.site_id = $1 AND sp.org_id = $2
           GROUP BY sp.id, sp.name, sp.health, sp.device_id, di.name
           ORDER BY sp.name`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT COUNT(*) AS total FROM drives WHERE site_id = $1 AND org_id = $2`,
          [siteId, orgId]
        ),
        db.query(
          `SELECT de.id, de.device_id, di.name AS device_name,
                  de.event_type, de.from_state, de.to_state, de.created_at
           FROM device_events de
           LEFT JOIN device_instances di ON di.id = de.device_id
           WHERE de.site_id = $1 AND de.org_id = $2
             AND de.created_at > now() - interval '24 hours'
           ORDER BY de.created_at DESC
           LIMIT 50`,
          [siteId, orgId]
        ),
      ]);

      const ipCounts = {};
      for (const row of ipCountsRes.rows) {
        ipCounts[row.subnet_id] = parseInt(row.used_count, 10);
      }

      res.json({
        devices: devicesRes.rows.map(r => ({
          id:            r.id,
          name:          r.name,
          typeName:      r.type_name ?? 'Unknown',
          ip:            r.ip ?? undefined,
          currentStatus: r.current_status ?? undefined,
          rackId:        r.rack_id ?? undefined,
          zoneId:        r.zone_id ?? undefined,
        })),
        subnets: subnetsRes.rows.map(r => ({
          id:        r.id,
          name:      r.name,
          cidr:      r.cidr,
          vlan:      r.vlan ?? undefined,
          usedCount: ipCounts[r.id] ?? 0,
        })),
        vlanCount:  parseInt(vlanRes.rows[0]?.vlan_count ?? '0', 10),
        pools: poolsRes.rows.map(r => ({
          id:         r.id,
          name:       r.name,
          health:     r.health,
          driveCount: parseInt(r.drive_count, 10),
          deviceName: r.device_name ?? 'Unknown',
        })),
        driveCount: parseInt(driveCountRes.rows[0]?.total ?? '0', 10),
        activity: activityRes.rows.map(r => ({
          id:         r.id,
          deviceId:   r.device_id,
          deviceName: r.device_name ?? 'Unknown Device',
          eventType:  r.event_type,
          fromState:  r.from_state ?? undefined,
          toState:    r.to_state ?? undefined,
          createdAt:  r.created_at,
        })),
      });
    } catch (err) {
      console.error('[GET /sites/:siteId/overview/widgets]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /api/sites/:siteId/overview/layout — user's saved widget layout
  router.get('/layout', async (req, res) => {
    const { siteId } = req.params;
    const userId = req.user.userId;
    try {
      const { rows } = await db.query(
        `SELECT widget_key, x, y, w, h, visible
         FROM dashboard_widgets
         WHERE user_id = $1 AND site_id = $2
         ORDER BY widget_key`,
        [userId, siteId]
      );

      if (rows.length === 0) {
        return res.json(DEFAULT_LAYOUT);
      }

      res.json(rows.map(r => ({
        widgetKey: r.widget_key,
        x:         r.x,
        y:         r.y,
        w:         r.w,
        h:         r.h,
        visible:   r.visible,
      })));
    } catch (err) {
      console.error('[GET /sites/:siteId/overview/layout]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /api/sites/:siteId/overview/layout — save widget layout
  router.patch('/layout', async (req, res) => {
    const { siteId } = req.params;
    const userId = req.user.userId;
    const { layout } = req.body;

    if (!Array.isArray(layout)) {
      return res.status(400).json({ error: 'layout must be an array' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM dashboard_widgets WHERE user_id = $1 AND site_id = $2`,
        [userId, siteId]
      );
      for (const item of layout) {
        await client.query(
          `INSERT INTO dashboard_widgets (user_id, site_id, widget_key, x, y, w, h, visible)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, siteId, item.widgetKey, item.x ?? 0, item.y ?? 0, item.w ?? 6, item.h ?? 4, item.visible ?? true]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[PATCH /sites/:siteId/overview/layout]', err);
      res.status(500).json({ error: 'server error' });
    } finally {
      client.release();
    }
  });

  return router;
};
