'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const PositionsSchema = z.object({
  positions: z.record(z.string().uuid(), z.object({
    x: z.number(),
    y: z.number(),
  })),
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

module.exports = function topologyRoutes(db) {
  const router = express.Router({ mergeParams: true });

  // GET /api/sites/:siteId/topology/graph
  router.get(
    '/:siteId/topology/graph',
    requireAuth, requireSiteAccess(db),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;

      try {
        const [devicesResult, connectionsResult, subnetsResult, ipsResult, positionsResult, vlansResult] =
          await withOrg(db, orgId, async (c) => {
            const devices = await c.query(
              `SELECT id, name, type_id, ip, rack_id, switch_role, is_gateway
               FROM device_instances
               WHERE site_id = $1 AND org_id = $2`,
              [siteId, orgId]
            );
            const connections = await c.query(
              `SELECT id, src_device_id, dst_device_id, cable_type_id, label
               FROM connections
               WHERE site_id = $1 AND org_id = $2
                 AND dst_device_id IS NOT NULL`,
              [siteId, orgId]
            );
            const subnets = await c.query(
              `SELECT id, cidr, vlan FROM subnets
               WHERE site_id = $1 AND org_id = $2`,
              [siteId, orgId]
            );
            const ips = await c.query(
              `SELECT ip, device_id, subnet_id FROM ip_assignments
               WHERE site_id = $1 AND org_id = $2 AND device_id IS NOT NULL`,
              [siteId, orgId]
            );
            const positions = await c.query(
              `SELECT device_id, x, y FROM topology_positions
               WHERE site_id = $1 AND org_id = $2`,
              [siteId, orgId]
            );
            const vlans = await c.query(
              `SELECT id, vlan_id, subnet_id FROM vlans
               WHERE site_id = $1 AND org_id = $2`,
              [siteId, orgId]
            );
            return [devices, connections, subnets, ips, positions, vlans];
          });

        const devices = devicesResult.rows;
        const connections = connectionsResult.rows;
        const ips = ipsResult.rows;
        const subnets = subnetsResult.rows;
        const vlans = vlansResult.rows;

        // Build a map of deviceId -> IP assignments with subnet info
        const deviceIpMap = {};
        for (const ip of ips) {
          if (!deviceIpMap[ip.device_id]) deviceIpMap[ip.device_id] = [];
          deviceIpMap[ip.device_id].push(ip);
        }

        // Build subnet -> vlan map
        const subnetVlanMap = {};
        for (const v of vlans) {
          if (v.subnet_id) subnetVlanMap[v.subnet_id] = v.id;
        }

        // Find subnet CIDR by id
        const subnetMap = {};
        for (const s of subnets) {
          subnetMap[s.id] = s;
        }

        // Determine which devices appear in connections
        const connectedDeviceIds = new Set();
        for (const c of connections) {
          connectedDeviceIds.add(c.src_device_id);
          if (c.dst_device_id) connectedDeviceIds.add(c.dst_device_id);
        }

        // Build nodes: only devices with at least one connection
        const nodes = devices
          .filter(d => connectedDeviceIds.has(d.id))
          .map(d => {
            // Find subnet CIDR for this device
            let subnetCidr = null;
            const deviceIps = deviceIpMap[d.id];
            if (deviceIps && deviceIps.length > 0) {
              const firstIp = deviceIps[0];
              const subnet = subnetMap[firstIp.subnet_id];
              if (subnet) subnetCidr = subnet.cidr;
            }

            return {
              id: d.id,
              label: d.name,
              type: d.type_id,
              switchRole: d.switch_role || 'unclassified',
              isGateway: d.is_gateway || false,
              rackId: d.rack_id || undefined,
              subnetCidr,
              ip: d.ip || undefined,
            };
          });

        // Build edges: connections between two devices (not external)
        const edges = connections.map(c => {
          // Determine vlanId: check if both src and dst devices share a VLAN subnet
          let vlanId = null;
          const srcIps = deviceIpMap[c.src_device_id] || [];
          const dstIps = deviceIpMap[c.dst_device_id] || [];
          for (const sip of srcIps) {
            for (const dip of dstIps) {
              if (sip.subnet_id === dip.subnet_id && subnetVlanMap[sip.subnet_id]) {
                vlanId = subnetVlanMap[sip.subnet_id];
                break;
              }
            }
            if (vlanId) break;
          }

          return {
            id: c.id,
            source: c.src_device_id,
            target: c.dst_device_id,
            cableType: c.cable_type_id || undefined,
            label: c.label || undefined,
            vlanId,
          };
        });

        // Build positions map
        const positions = {};
        for (const p of positionsResult.rows) {
          positions[p.device_id] = { x: p.x, y: p.y };
        }

        res.json({ nodes, edges, positions });
      } catch (err) {
        console.error('[GET /topology/graph]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  // PATCH /api/sites/:siteId/topology/positions
  router.patch(
    '/:siteId/topology/positions',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(PositionsSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { positions } = req.body;

      try {
        await withOrg(db, orgId, async (c) => {
          for (const [deviceId, pos] of Object.entries(positions)) {
            await c.query(
              `INSERT INTO topology_positions (org_id, site_id, device_id, x, y)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (site_id, device_id)
               DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y`,
              [orgId, siteId, deviceId, pos.x, pos.y]
            );
          }
        });

        res.json({ ok: true });
      } catch (err) {
        console.error('[PUT /topology/positions]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
