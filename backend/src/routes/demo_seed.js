'use strict';

const express = require('express');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');

/**
 * Inserts demo data (2 zones, 2 racks, 50 devices) into an existing site.
 * Extracted from seed_demo.js so it can be called from the API.
 */
async function seedDemoData(client, orgId, siteId) {
  // ── Zones ─────────────────────────────────────────────────────────────
  const z1 = await client.query(
    `INSERT INTO zones (org_id, site_id, name, description)
     VALUES ($1, $2, 'Primary Compute', 'Core compute, networking, and databases')
     RETURNING id`,
    [orgId, siteId]
  );
  const zone1Id = z1.rows[0].id;

  const z2 = await client.query(
    `INSERT INTO zones (org_id, site_id, name, description)
     VALUES ($1, $2, 'Storage & Services', 'NAS arrays, hypervisors, and auxiliary services')
     RETURNING id`,
    [orgId, siteId]
  );
  const zone2Id = z2.rows[0].id;

  // ── Racks ─────────────────────────────────────────────────────────────
  const rk1 = await client.query(
    `INSERT INTO racks (org_id, site_id, zone_id, name, u_height, power_budget_watts)
     VALUES ($1, $2, $3, 'Rack A — Primary Compute', 42, 6000)
     RETURNING id`,
    [orgId, siteId, zone1Id]
  );
  const rack1Id = rk1.rows[0].id;

  const rk2 = await client.query(
    `INSERT INTO racks (org_id, site_id, zone_id, name, u_height, power_budget_watts)
     VALUES ($1, $2, $3, 'Rack B — Storage & Services', 42, 4000)
     RETURNING id`,
    [orgId, siteId, zone2Id]
  );
  const rack2Id = rk2.rows[0].id;

  // ── Device inserter ─────────────────────────────────────────────────
  async function dev({ rackId, zoneId, type, name, u, h = 1, ip = null, serial = null, status = 'up', notes = null }) {
    await client.query(
      `INSERT INTO device_instances
         (org_id, site_id, zone_id, rack_id, type_id, name,
          rack_u, u_height, face, ip, serial, current_status, notes, is_draft)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'front',$9,$10,$11,$12,false)`,
      [orgId, siteId, zoneId, rackId, type, name, u, h, ip, serial, status, notes]
    );
  }

  // ── Rack A: Primary Compute — 28 devices ──────────────────────────
  const A = { rackId: rack1Id, zoneId: zone1Id };
  await dev({ ...A, type: 'dt-patch-panel', name: 'Core-PP-01',   u: 1,       notes: '24-port Cat6 patch panel' });
  await dev({ ...A, type: 'dt-switch',      name: 'core-sw-01',   u: 2,       ip: '192.168.1.1',  notes: '48-port managed L3 core switch' });
  await dev({ ...A, type: 'dt-firewall',    name: 'fw-01',        u: 3,       ip: '192.168.1.2',  notes: 'Primary perimeter firewall' });
  await dev({ ...A, type: 'dt-router',      name: 'rtr-01',       u: 4,       ip: '192.168.1.3',  notes: 'Edge router / WAN handoff' });
  await dev({ ...A, type: 'dt-ups',         name: 'ups-01',       u: 5,  h:2, notes: '2200VA UPS, A-side, runtime ~18 min' });
  await dev({ ...A, type: 'dt-kvm',         name: 'kvm-01',       u: 7,       ip: '192.168.1.10', notes: '8-port IP KVM' });
  await dev({ ...A, type: 'dt-server',      name: 'web-01',       u: 8,       ip: '192.168.1.20', notes: 'Nginx, prod frontend' });
  await dev({ ...A, type: 'dt-server',      name: 'web-02',       u: 9,       ip: '192.168.1.21', notes: 'Nginx, prod frontend replica' });
  await dev({ ...A, type: 'dt-server',      name: 'web-03',       u: 10,      ip: '192.168.1.22', notes: 'Nginx, staging', status: 'degraded' });
  await dev({ ...A, type: 'dt-server',      name: 'app-01',       u: 11,      ip: '192.168.1.30', notes: 'Node.js application server' });
  await dev({ ...A, type: 'dt-server',      name: 'app-02',       u: 12,      ip: '192.168.1.31', notes: 'Node.js application server replica' });
  await dev({ ...A, type: 'dt-server',      name: 'db-01',        u: 13, h:2, ip: '192.168.1.40', serial: 'SRV-DB-001', notes: 'PostgreSQL primary, 2U' });
  await dev({ ...A, type: 'dt-server',      name: 'db-02',        u: 15, h:2, ip: '192.168.1.41', serial: 'SRV-DB-002', notes: 'PostgreSQL replica, 2U' });
  await dev({ ...A, type: 'dt-server',      name: 'mon-01',       u: 17,      ip: '192.168.1.50', notes: 'Grafana + Prometheus monitoring stack' });
  await dev({ ...A, type: 'dt-server',      name: 'ci-01',        u: 18,      ip: '192.168.1.51', notes: 'Gitea + Woodpecker CI runner' });
  await dev({ ...A, type: 'dt-switch',      name: 'mgmt-sw-01',   u: 19,      ip: '192.168.1.5',  notes: 'Out-of-band management switch' });
  await dev({ ...A, type: 'dt-patch-panel', name: 'mgmt-pp-01',   u: 20,      notes: 'Management network patch panel' });
  await dev({ ...A, type: 'dt-server',      name: 'compute-01',   u: 21,      ip: '192.168.1.60', serial: 'SRV-COMP-001' });
  await dev({ ...A, type: 'dt-server',      name: 'compute-02',   u: 22,      ip: '192.168.1.61', serial: 'SRV-COMP-002' });
  await dev({ ...A, type: 'dt-server',      name: 'compute-03',   u: 23,      ip: '192.168.1.62', serial: 'SRV-COMP-003' });
  await dev({ ...A, type: 'dt-server',      name: 'compute-04',   u: 24, h:2, ip: '192.168.1.63', serial: 'SRV-COMP-004', notes: '2U high-density compute node' });
  await dev({ ...A, type: 'dt-server',      name: 'backup-01',    u: 26,      ip: '192.168.1.70', notes: 'Restic backup target + rsync daemon' });
  await dev({ ...A, type: 'dt-nas',         name: 'nas-01',       u: 27, h:2, ip: '192.168.1.80', serial: 'NAS-001', notes: 'TrueNAS Scale, 8×8TB ZFS mirror' });
  await dev({ ...A, type: 'dt-switch',      name: 'stor-sw-01',   u: 29,      ip: '192.168.1.6',  notes: '10GbE storage network switch' });
  await dev({ ...A, type: 'dt-patch-panel', name: 'stor-pp-01',   u: 30,      notes: 'Storage network patch panel' });
  await dev({ ...A, type: 'dt-ups',         name: 'ups-02',       u: 31, h:2, ip: '192.168.1.91', notes: 'APC Smart-UPS 1500VA, B-side' });
  await dev({ ...A, type: 'dt-pdu',         name: 'pdu-01',       u: 33,      ip: '192.168.1.95', notes: 'APC Metered PDU, A-side' });
  await dev({ ...A, type: 'dt-pdu',         name: 'pdu-02',       u: 34,      ip: '192.168.1.96', notes: 'APC Metered PDU, B-side' });

  // ── Rack B: Storage & Services — 22 devices ──────────────────────
  const B = { rackId: rack2Id, zoneId: zone2Id };
  await dev({ ...B, type: 'dt-patch-panel', name: 'svc-pp-01',    u: 1,       notes: '24-port Cat6 patch panel' });
  await dev({ ...B, type: 'dt-switch',      name: 'svc-sw-01',    u: 2,       ip: '192.168.2.1',  notes: '24-port managed access switch' });
  await dev({ ...B, type: 'dt-firewall',    name: 'fw-02',        u: 3,       ip: '192.168.2.2',  notes: 'Internal segmentation firewall', status: 'degraded' });
  await dev({ ...B, type: 'dt-nas',         name: 'nas-02',       u: 4,  h:4, ip: '192.168.2.10', serial: 'NAS-002', notes: 'Synology DS3622xs+, 12-bay, 4U' });
  await dev({ ...B, type: 'dt-nas',         name: 'nas-03',       u: 8,  h:4, ip: '192.168.2.11', serial: 'NAS-003', notes: 'TrueNAS Core, 16-bay cold storage, 4U' });
  await dev({ ...B, type: 'dt-nas',         name: 'nas-04',       u: 12, h:2, ip: '192.168.2.12', serial: 'NAS-004', notes: 'QNAP TS-873A, all-flash tier, 2U' });
  await dev({ ...B, type: 'dt-server',      name: 'media-01',     u: 14,      ip: '192.168.2.20', notes: 'Jellyfin media server' });
  await dev({ ...B, type: 'dt-server',      name: 'media-02',     u: 15,      ip: '192.168.2.21', notes: 'Radarr / Sonarr / Lidarr stack' });
  await dev({ ...B, type: 'dt-server',      name: 'plex-01',      u: 16,      ip: '192.168.2.22', notes: 'Plex Media Server, GPU transcoding', status: 'down' });
  await dev({ ...B, type: 'dt-server',      name: 'proxy-01',     u: 17,      ip: '192.168.2.30', notes: 'Traefik reverse proxy' });
  await dev({ ...B, type: 'dt-server',      name: 'vpn-01',       u: 18,      ip: '192.168.2.31', notes: 'WireGuard VPN gateway' });
  await dev({ ...B, type: 'dt-server',      name: 'hyp-01',       u: 19, h:2, ip: '192.168.2.40', serial: 'SRV-HYP-001', notes: 'Proxmox VE node 1, 2U' });
  await dev({ ...B, type: 'dt-server',      name: 'hyp-02',       u: 21, h:2, ip: '192.168.2.41', serial: 'SRV-HYP-002', notes: 'Proxmox VE node 2, 2U' });
  await dev({ ...B, type: 'dt-switch',      name: 'lab-sw-01',    u: 23,      ip: '192.168.2.5',  notes: 'Lab / dev VLAN switch' });
  await dev({ ...B, type: 'dt-patch-panel', name: 'lab-pp-01',    u: 24,      notes: 'Lab network patch panel' });
  await dev({ ...B, type: 'dt-server',      name: 'test-01',      u: 25,      ip: '192.168.2.50', notes: 'Test / staging node' });
  await dev({ ...B, type: 'dt-server',      name: 'test-02',      u: 26,      ip: '192.168.2.51', notes: 'Test / staging node' });
  await dev({ ...B, type: 'dt-server',      name: 'test-03',      u: 27,      ip: '192.168.2.52', notes: 'Test / staging node', status: 'maintenance' });
  await dev({ ...B, type: 'dt-ups',         name: 'ups-03',       u: 28, h:2, ip: '192.168.2.90', notes: 'CyberPower OR1500LCDRT2U' });
  await dev({ ...B, type: 'dt-kvm',         name: 'kvm-02',       u: 30,      ip: '192.168.2.95', notes: '16-port IP KVM, rack B' });
  await dev({ ...B, type: 'dt-pdu',         name: 'pdu-03',       u: 31,      ip: '192.168.2.97', notes: 'APC Metered PDU, A-side' });
  await dev({ ...B, type: 'dt-pdu',         name: 'pdu-04',       u: 32,      ip: '192.168.2.98', notes: 'APC Metered PDU, B-side' });

  return { zones: 2, racks: 2, devices: 50 };
}

module.exports = function demoSeedRoutes(db) {
  const router = express.Router({ mergeParams: true });

  router.post('/:siteId/seed-demo', requireAuth, requireSiteAccess(db), requireRole('owner'), async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    const client = await db.connect();
    try {
      // Check if site already has devices
      const existing = await client.query(
        `SELECT COUNT(*)::int AS count FROM device_instances WHERE site_id = $1 AND org_id = $2`,
        [siteId, orgId]
      );
      if (existing.rows[0].count > 0) {
        return res.status(409).json({ error: 'site already has devices — seed skipped' });
      }

      await client.query('BEGIN');
      const result = await seedDemoData(client, orgId, siteId);
      await client.query('COMMIT');
      res.json({ success: true, ...result });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[POST /api/sites/:siteId/seed-demo]', err);
      res.status(500).json({ error: 'server error' });
    } finally {
      client.release();
    }
  });

  return router;
};
