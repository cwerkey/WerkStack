'use strict';

// Topology seed script — adds switch_role/is_gateway tags, VLANs, subnets,
// IP assignments, connections, and taxonomy colors to the Demo Lab site.
// Requires seed_demo.js to have run first.
//
// Usage: DATABASE_URL=... node backend/src/db/seed-topology.js

const { getDb } = require('./index');
const { migrate } = require('./migrate');

async function seedTopology() {
  const db = getDb();
  await db.query('SELECT 1');
  console.log('[seed-topology] connected');

  await migrate(db);
  console.log('[seed-topology] migrations applied');

  const client = await db.connect();
  try {
    // Find the Demo Lab site
    const siteResult = await client.query(`SELECT id, org_id FROM sites WHERE name = 'Demo Lab' LIMIT 1`);
    if (siteResult.rows.length === 0) {
      console.error('[seed-topology] no "Demo Lab" site found — run seed_demo.js first');
      process.exit(1);
    }
    const siteId = siteResult.rows[0].id;
    const orgId = siteResult.rows[0].org_id;

    // Check if already seeded
    const existing = await client.query(
      `SELECT id FROM vlans WHERE site_id = $1 LIMIT 1`,
      [siteId]
    );
    if (existing.rows.length > 0) {
      console.log('[seed-topology] topology data already exists — skipping');
      await db.end();
      return;
    }

    await client.query('BEGIN');

    // ── Helper: find device by name ─────────────────────────────────────────
    async function deviceId(name) {
      const r = await client.query(
        `SELECT id FROM device_instances WHERE site_id = $1 AND name = $2`,
        [siteId, name]
      );
      if (r.rows.length === 0) throw new Error(`Device "${name}" not found`);
      return r.rows[0].id;
    }

    // ── Set switch_role and is_gateway on devices ───────────────────────────
    // rtr-01 is the WAN gateway
    await client.query(
      `UPDATE device_instances SET is_gateway = true, switch_role = 'unclassified' WHERE site_id = $1 AND name = 'rtr-01'`,
      [siteId]
    );

    // core-sw-01 is the core switch
    await client.query(
      `UPDATE device_instances SET switch_role = 'core' WHERE site_id = $1 AND name = 'core-sw-01'`,
      [siteId]
    );

    // Edge switches
    for (const name of ['mgmt-sw-01', 'stor-sw-01', 'svc-sw-01']) {
      await client.query(
        `UPDATE device_instances SET switch_role = 'edge' WHERE site_id = $1 AND name = $2`,
        [siteId, name]
      );
    }

    // Access switch
    await client.query(
      `UPDATE device_instances SET switch_role = 'access' WHERE site_id = $1 AND name = 'lab-sw-01'`,
      [siteId]
    );

    console.log('[seed-topology] switch roles set');

    // ── Subnets ──────────────────────────────────────────────────────────────
    const subnet1 = await client.query(
      `INSERT INTO subnets (org_id, site_id, cidr, name, vlan, gateway, notes)
       VALUES ($1, $2, '192.168.1.0/24', 'Management', 10, '192.168.1.1', 'Core infrastructure + management')
       RETURNING id`,
      [orgId, siteId]
    );
    const mgmtSubnetId = subnet1.rows[0].id;

    const subnet2 = await client.query(
      `INSERT INTO subnets (org_id, site_id, cidr, name, vlan, gateway, notes)
       VALUES ($1, $2, '192.168.2.0/24', 'Services', 20, '192.168.2.1', 'Services and storage rack')
       RETURNING id`,
      [orgId, siteId]
    );
    const svcSubnetId = subnet2.rows[0].id;

    const subnet3 = await client.query(
      `INSERT INTO subnets (org_id, site_id, cidr, name, vlan, gateway, notes)
       VALUES ($1, $2, '10.0.100.0/24', 'Storage', 100, '10.0.100.1', 'Dedicated storage VLAN')
       RETURNING id`,
      [orgId, siteId]
    );
    const storSubnetId = subnet3.rows[0].id;

    console.log('[seed-topology] subnets created');

    // ── VLANs ────────────────────────────────────────────────────────────────
    const vlan10 = await client.query(
      `INSERT INTO vlans (org_id, site_id, vlan_id, name, color, subnet_id)
       VALUES ($1, $2, 10, 'Management', '#4a90d9', $3) RETURNING id`,
      [orgId, siteId, mgmtSubnetId]
    );
    const vlan10Id = vlan10.rows[0].id;

    const vlan20 = await client.query(
      `INSERT INTO vlans (org_id, site_id, vlan_id, name, color, subnet_id)
       VALUES ($1, $2, 20, 'Services', '#7bc07b', $3) RETURNING id`,
      [orgId, siteId, svcSubnetId]
    );
    const vlan20Id = vlan20.rows[0].id;

    const vlan100 = await client.query(
      `INSERT INTO vlans (org_id, site_id, vlan_id, name, color, subnet_id)
       VALUES ($1, $2, 100, 'Storage', '#e2a662', $3) RETURNING id`,
      [orgId, siteId, storSubnetId]
    );
    const vlan100Id = vlan100.rows[0].id;

    console.log('[seed-topology] VLANs created');

    // ── Taxonomy entries (VLAN colors) ───────────────────────────────────────
    await client.query(
      `INSERT INTO taxonomies (org_id, site_id, category, reference_id, color_hex)
       VALUES ($1, $2, 'vlan', $3, '#4a90d9')`,
      [orgId, siteId, vlan10Id]
    );
    await client.query(
      `INSERT INTO taxonomies (org_id, site_id, category, reference_id, color_hex)
       VALUES ($1, $2, 'vlan', $3, '#7bc07b')`,
      [orgId, siteId, vlan20Id]
    );
    await client.query(
      `INSERT INTO taxonomies (org_id, site_id, category, reference_id, color_hex)
       VALUES ($1, $2, 'vlan', $3, '#e2a662')`,
      [orgId, siteId, vlan100Id]
    );

    console.log('[seed-topology] taxonomy entries created');

    // ── IP assignments ───────────────────────────────────────────────────────
    // Management VLAN devices
    const mgmtDevices = [
      ['core-sw-01', '192.168.1.1'],
      ['fw-01', '192.168.1.2'],
      ['rtr-01', '192.168.1.3'],
      ['mgmt-sw-01', '192.168.1.5'],
      ['stor-sw-01', '192.168.1.6'],
      ['kvm-01', '192.168.1.10'],
      ['web-01', '192.168.1.20'],
      ['web-02', '192.168.1.21'],
      ['web-03', '192.168.1.22'],
      ['app-01', '192.168.1.30'],
      ['app-02', '192.168.1.31'],
      ['db-01', '192.168.1.40'],
      ['db-02', '192.168.1.41'],
      ['mon-01', '192.168.1.50'],
      ['ci-01', '192.168.1.51'],
    ];
    for (const [name, ip] of mgmtDevices) {
      const did = await deviceId(name);
      await client.query(
        `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [orgId, siteId, mgmtSubnetId, ip, did]
      );
    }

    // Services VLAN devices
    const svcDevices = [
      ['svc-sw-01', '192.168.2.1'],
      ['fw-02', '192.168.2.2'],
      ['nas-02', '192.168.2.10'],
      ['media-01', '192.168.2.20'],
      ['media-02', '192.168.2.21'],
      ['plex-01', '192.168.2.22'],
      ['proxy-01', '192.168.2.30'],
      ['vpn-01', '192.168.2.31'],
      ['hyp-01', '192.168.2.40'],
      ['hyp-02', '192.168.2.41'],
      ['lab-sw-01', '192.168.2.5'],
      ['test-01', '192.168.2.50'],
      ['test-02', '192.168.2.51'],
    ];
    for (const [name, ip] of svcDevices) {
      const did = await deviceId(name);
      await client.query(
        `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [orgId, siteId, svcSubnetId, ip, did]
      );
    }

    // Storage VLAN devices
    const storDevices = [
      ['nas-01', '10.0.100.10'],
      ['nas-02', '10.0.100.11'],
      ['nas-03', '10.0.100.12'],
      ['nas-04', '10.0.100.13'],
      ['db-01', '10.0.100.40'],
      ['db-02', '10.0.100.41'],
    ];
    for (const [name, ip] of storDevices) {
      const did = await deviceId(name);
      await client.query(
        `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [orgId, siteId, storSubnetId, ip, did]
      );
    }

    console.log('[seed-topology] IP assignments created');

    // ── Connections (cables) ─────────────────────────────────────────────────
    // Helper to create a connection
    async function conn(srcName, dstName, cableType = 'cat6', label = null) {
      const srcId = await deviceId(srcName);
      const dstId = await deviceId(dstName);
      await client.query(
        `INSERT INTO connections (org_id, site_id, src_device_id, dst_device_id, cable_type_id, label)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orgId, siteId, srcId, dstId, cableType, label]
      );
    }

    // WAN gateway → core
    await conn('rtr-01', 'core-sw-01', 'cat6a', 'WAN uplink');
    await conn('fw-01', 'rtr-01', 'cat6', 'Firewall → Router');

    // Core → edge switches
    await conn('core-sw-01', 'mgmt-sw-01', 'cat6a', 'Core → Mgmt');
    await conn('core-sw-01', 'stor-sw-01', 'sfp-dac', 'Core → Storage 10G');
    await conn('core-sw-01', 'svc-sw-01', 'cat6a', 'Core → Services');

    // Edge → access
    await conn('svc-sw-01', 'lab-sw-01', 'cat6', 'Services → Lab');

    // Servers connected to management switch (Rack A)
    await conn('mgmt-sw-01', 'web-01', 'cat6');
    await conn('mgmt-sw-01', 'web-02', 'cat6');
    await conn('mgmt-sw-01', 'web-03', 'cat6');
    await conn('mgmt-sw-01', 'app-01', 'cat6');
    await conn('mgmt-sw-01', 'app-02', 'cat6');
    await conn('mgmt-sw-01', 'mon-01', 'cat6');
    await conn('mgmt-sw-01', 'ci-01', 'cat6');
    await conn('mgmt-sw-01', 'kvm-01', 'cat6');

    // Database servers to storage switch (10G)
    await conn('stor-sw-01', 'db-01', 'sfp-dac', 'DB primary 10G');
    await conn('stor-sw-01', 'db-02', 'sfp-dac', 'DB replica 10G');
    await conn('stor-sw-01', 'nas-01', 'sfp-dac', 'NAS-01 10G');

    // Services switch connections (Rack B)
    await conn('svc-sw-01', 'fw-02', 'cat6');
    await conn('svc-sw-01', 'nas-02', 'cat6a');
    await conn('svc-sw-01', 'nas-03', 'cat6a');
    await conn('svc-sw-01', 'media-01', 'cat6');
    await conn('svc-sw-01', 'media-02', 'cat6');
    await conn('svc-sw-01', 'plex-01', 'cat6');
    await conn('svc-sw-01', 'proxy-01', 'cat6');
    await conn('svc-sw-01', 'vpn-01', 'cat6');
    await conn('svc-sw-01', 'hyp-01', 'cat6a');
    await conn('svc-sw-01', 'hyp-02', 'cat6a');

    // Lab switch connections
    await conn('lab-sw-01', 'test-01', 'cat6');
    await conn('lab-sw-01', 'test-02', 'cat6');
    await conn('lab-sw-01', 'test-03', 'cat6');
    await conn('lab-sw-01', 'nas-04', 'cat6');

    // Storage switch → NAS (dedicated storage VLAN)
    await conn('stor-sw-01', 'nas-02', 'sfp-dac', 'NAS-02 storage 10G');
    await conn('stor-sw-01', 'nas-03', 'sfp-dac', 'NAS-03 storage 10G');

    // Compute nodes connected to management
    await conn('mgmt-sw-01', 'compute-01', 'cat6');
    await conn('mgmt-sw-01', 'compute-02', 'cat6');
    await conn('mgmt-sw-01', 'compute-03', 'cat6');
    await conn('mgmt-sw-01', 'compute-04', 'cat6');
    await conn('mgmt-sw-01', 'backup-01', 'cat6');

    console.log('[seed-topology] connections created');

    await client.query('COMMIT');

    console.log('[seed-topology] done!');
    console.log('');
    console.log('  Topology data seeded for "Demo Lab":');
    console.log('    Gateway:  rtr-01');
    console.log('    Core:     core-sw-01');
    console.log('    Edge:     mgmt-sw-01, stor-sw-01, svc-sw-01');
    console.log('    Access:   lab-sw-01');
    console.log('    VLANs:    10 (Management), 20 (Services), 100 (Storage)');
    console.log('    Subnets:  192.168.1.0/24, 192.168.2.0/24, 10.0.100.0/24');
    console.log('    Connections: ~35 cables');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed-topology] error:', err.message);
    throw err;
  } finally {
    client.release();
    await db.end();
  }
}

seedTopology().catch(err => {
  console.error(err);
  process.exit(1);
});
