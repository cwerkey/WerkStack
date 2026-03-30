'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const PathfinderQuerySchema = z.object({
  srcDeviceId: z.string().uuid(),
  dstDeviceId: z.string().uuid(),
  layer:       z.enum(['L1', 'L3', 'all']).default('all'),
  maxDepth:    z.coerce.number().int().min(1).max(15).default(15),
});

const VpnTunnelSchema = z.object({
  srcDeviceId: z.string().uuid(),
  dstDeviceId: z.string().uuid(),
  tunnelType:  z.enum(['vpn', 'vxlan', 'gre', 'ipsec', 'wireguard']).default('vpn'),
  label:       z.string().max(200).optional(),
  notes:       z.string().max(2000).optional(),
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

function toTunnel(row) {
  return {
    id:           row.id,
    orgId:        row.org_id,
    siteId:       row.site_id,
    srcDeviceId:  row.src_device_id,
    dstDeviceId:  row.dst_device_id,
    tunnelType:   row.tunnel_type,
    label:        row.label    ?? undefined,
    notes:        row.notes    ?? undefined,
    createdAt:    row.created_at,
  };
}

const BRIDGE_TYPES = new Set(['dt-switch', 'dt-patch-panel', 'dt-hub']);

module.exports = function pathfinderRoutes(db) {
  const router = express.Router({ mergeParams: true });

  router.post(
    '/trace',
    requireAuth, requireSiteAccess(db), validate(PathfinderQuerySchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      const { srcDeviceId, dstDeviceId, layer, maxDepth } = req.body;

      try {
        const result = await withOrg(db, orgId, async (c) => {
          const devicesRes = await c.query(
            `SELECT id, type_id, name FROM device_instances
             WHERE site_id = $1 AND org_id = $2`,
            [siteId, orgId]
          );
          const deviceMap = new Map();
          devicesRes.rows.forEach(d => deviceMap.set(d.id, { typeId: d.type_id, name: d.name }));

          const edges = [];

          if (layer === 'L1' || layer === 'all') {
            const conns = await c.query(
              `SELECT src_device_id, src_port, src_block_id, src_block_type,
                      dst_device_id, dst_port, dst_block_id, dst_block_type, label
               FROM connections
               WHERE site_id = $1 AND org_id = $2 AND dst_device_id IS NOT NULL`,
              [siteId, orgId]
            );
            conns.rows.forEach(r => {
              edges.push({
                from: r.src_device_id, to: r.dst_device_id,
                port: r.src_port, blockId: r.src_block_id, blockType: r.src_block_type,
                dstPort: r.dst_port, dstBlockId: r.dst_block_id, dstBlockType: r.dst_block_type,
                linkType: 'L1', label: r.label,
              });
              edges.push({
                from: r.dst_device_id, to: r.src_device_id,
                port: r.dst_port, blockId: r.dst_block_id, blockType: r.dst_block_type,
                dstPort: r.src_port, dstBlockId: r.src_block_id, dstBlockType: r.src_block_type,
                linkType: 'L1', label: r.label,
              });
            });
          }

          if (layer === 'L3' || layer === 'all') {
            const tunnels = await c.query(
              `SELECT src_device_id, dst_device_id, tunnel_type, label
               FROM vpn_tunnels
               WHERE site_id = $1 AND org_id = $2`,
              [siteId, orgId]
            );
            tunnels.rows.forEach(r => {
              edges.push({
                from: r.src_device_id, to: r.dst_device_id,
                linkType: 'L3', label: r.label || r.tunnel_type,
              });
              edges.push({
                from: r.dst_device_id, to: r.src_device_id,
                linkType: 'L3', label: r.label || r.tunnel_type,
              });
            });
          }

          const adjacency = new Map();
          edges.forEach(e => {
            if (!adjacency.has(e.from)) adjacency.set(e.from, []);
            adjacency.get(e.from).push(e);
          });

          const queue = [{ deviceId: srcDeviceId, path: [], visited: new Set([srcDeviceId]) }];
          let foundPath = null;
          let hasCycle = false;

          while (queue.length > 0) {
            const { deviceId, path, visited } = queue.shift();

            if (deviceId === dstDeviceId && path.length > 0) {
              foundPath = path;
              break;
            }

            if (path.length >= maxDepth) continue;

            const neighbors = adjacency.get(deviceId) || [];
            for (const edge of neighbors) {
              if (visited.has(edge.to)) {
                hasCycle = true;
                continue;
              }

              const dev = deviceMap.get(edge.to);
              const isBridge = dev ? BRIDGE_TYPES.has(dev.typeId) : false;

              const step = {
                deviceId:   edge.to,
                deviceName: dev?.name ?? 'unknown',
                port:       edge.dstPort ?? undefined,
                blockId:    edge.dstBlockId ?? undefined,
                blockType:  edge.dstBlockType ?? undefined,
                linkType:   edge.linkType,
                linkLabel:  edge.label ?? undefined,
                isBridge,
                depth:      path.length + 1,
              };

              const newPath = [...path, step];
              const newVisited = new Set(visited);
              newVisited.add(edge.to);

              queue.push({ deviceId: edge.to, path: newPath, visited: newVisited });
            }
          }

          const srcDev = deviceMap.get(srcDeviceId);
          const dstDev = deviceMap.get(dstDeviceId);

          return {
            source:      srcDev?.name ?? srcDeviceId,
            destination: dstDev?.name ?? dstDeviceId,
            found:       !!foundPath,
            path:        foundPath || [],
            hasCycle,
            depth:       foundPath ? foundPath.length : 0,
          };
        });

        res.json(result);
      } catch (err) {
        console.error('[POST /pathfinder/trace]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get(
    '/tunnels',
    requireAuth, requireSiteAccess(db),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `SELECT * FROM vpn_tunnels WHERE site_id = $1 AND org_id = $2 ORDER BY created_at`,
            [siteId, orgId]
          )
        );
        res.json(result.rows.map(toTunnel));
      } catch (err) {
        console.error('[GET /pathfinder/tunnels]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.post(
    '/tunnels',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(VpnTunnelSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      const { srcDeviceId, dstDeviceId, tunnelType, label, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO vpn_tunnels (org_id, site_id, src_device_id, dst_device_id, tunnel_type, label, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [orgId, siteId, srcDeviceId, dstDeviceId, tunnelType, label ?? null, notes ?? null]
          )
        );
        res.status(201).json(toTunnel(result.rows[0]));
      } catch (err) {
        console.error('[POST /pathfinder/tunnels]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/tunnels/:tunnelId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, tunnelId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM vpn_tunnels WHERE id=$1 AND site_id=$2 AND org_id=$3 RETURNING id`,
            [tunnelId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'tunnel not found' });
        res.status(204).end();
      } catch (err) {
        console.error('[DELETE /pathfinder/tunnels]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
