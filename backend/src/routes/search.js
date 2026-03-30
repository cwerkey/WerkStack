'use strict';

const express = require('express');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');

const VALID_TYPES = ['device', 'guide', 'subnet', 'pool', 'vm', 'app', 'connection'];

module.exports = function searchRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  router.get('/', async (req, res) => {
    const { siteId }  = req.params;
    const { orgId }   = req.user;
    const q           = (req.query.q || '').trim();
    const typesParam  = req.query.types;

    if (!q) return res.json([]);

    const requestedTypes = typesParam
      ? typesParam.split(',').map(t => t.trim()).filter(t => VALID_TYPES.includes(t))
      : VALID_TYPES;

    const include = new Set(requestedTypes);
    const results  = [];

    try {
      if (include.has('device')) {
        const r = await db.query(
          `SELECT di.id, di.name, di.ip_address, dt.name AS type_name
           FROM device_instances di
           LEFT JOIN device_types dt ON dt.id = di.type_id
           WHERE di.site_id = $1 AND di.org_id = $2
             AND (di.name ILIKE $3 OR di.ip_address ILIKE $3
                  OR di.serial ILIKE $3 OR di.asset_tag ILIKE $3)
           LIMIT 20`,
          [siteId, orgId, `%${q}%`]
        );
        for (const row of r.rows) {
          results.push({
            type:     'device',
            id:       row.id,
            name:     row.name,
            subtitle: row.ip_address || row.type_name || '',
            icon:     'server',
            route:    `/sites/${siteId}/racks`,
          });
        }
      }

      if (include.has('guide')) {
        const r = await db.query(
          `SELECT g.id, g.title, gm.name AS manual_name
           FROM guides g
           LEFT JOIN guide_manuals gm ON gm.id = g.manual_id
           WHERE g.site_id = $1 AND g.org_id = $2
             AND (g.title ILIKE $3 OR g.content ILIKE $3)
           LIMIT 20`,
          [siteId, orgId, `%${q}%`]
        );
        for (const row of r.rows) {
          results.push({
            type:     'guide',
            id:       row.id,
            name:     row.title,
            subtitle: row.manual_name || 'Uncategorized',
            icon:     'book',
            route:    `/sites/${siteId}/guides`,
          });
        }
      }

      if (include.has('subnet')) {
        const r = await db.query(
          `SELECT id, name, cidr FROM subnets
           WHERE site_id = $1 AND org_id = $2
             AND (name ILIKE $3 OR cidr ILIKE $3)
           LIMIT 20`,
          [siteId, orgId, `%${q}%`]
        );
        for (const row of r.rows) {
          results.push({
            type:     'subnet',
            id:       row.id,
            name:     row.name,
            subtitle: row.cidr,
            icon:     'network',
            route:    `/sites/${siteId}/network`,
          });
        }
      }

      if (include.has('pool')) {
        const r = await db.query(
          `SELECT id, name FROM storage_pools
           WHERE site_id = $1 AND org_id = $2
             AND name ILIKE $3
           LIMIT 20`,
          [siteId, orgId, `%${q}%`]
        );
        for (const row of r.rows) {
          results.push({
            type:     'pool',
            id:       row.id,
            name:     row.name,
            subtitle: 'storage pool',
            icon:     'storage',
            route:    `/sites/${siteId}/storage`,
          });
        }
      }

      if (include.has('vm')) {
        const r = await db.query(
          `SELECT id, name FROM os_vms
           WHERE site_id = $1 AND org_id = $2
             AND name ILIKE $3
           LIMIT 20`,
          [siteId, orgId, `%${q}%`]
        );
        for (const row of r.rows) {
          results.push({
            type:     'vm',
            id:       row.id,
            name:     row.name,
            subtitle: 'virtual machine',
            icon:     'cpu',
            route:    `/sites/${siteId}/os-stack`,
          });
        }
      }

      if (include.has('app')) {
        const r = await db.query(
          `SELECT id, name FROM os_apps
           WHERE site_id = $1 AND org_id = $2
             AND name ILIKE $3
           LIMIT 20`,
          [siteId, orgId, `%${q}%`]
        );
        for (const row of r.rows) {
          results.push({
            type:     'app',
            id:       row.id,
            name:     row.name,
            subtitle: 'application',
            icon:     'app',
            route:    `/sites/${siteId}/os-stack`,
          });
        }
      }

      if (include.has('connection')) {
        const r = await db.query(
          `SELECT id, label FROM connections
           WHERE site_id = $1 AND org_id = $2
             AND label ILIKE $3
           LIMIT 20`,
          [siteId, orgId, `%${q}%`]
        );
        for (const row of r.rows) {
          results.push({
            type:     'connection',
            id:       row.id,
            name:     row.label,
            subtitle: 'cable connection',
            icon:     'cable',
            route:    `/sites/${siteId}/network`,
          });
        }
      }

      const ORDER = ['device', 'guide', 'subnet', 'pool', 'vm', 'app', 'connection'];
      results.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));

      res.json(results);
    } catch (err) {
      console.error('[GET /search]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
