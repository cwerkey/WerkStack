#!/usr/bin/env node
/**
 * Stress seed — creates a realistic test site with:
 *   1 site, 2 zones, 5 racks, ~100 devices, PCIe cards, shelves, connections
 *
 * Usage:  DATABASE_URL=postgres://werkstack:werkstack_dev@localhost:5433/werkstack node backend/src/db/seed-stress.js
 */
const { randomUUID: uuid } = require('crypto');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://werkstack:werkstack_dev@localhost:5432/werkstack';
const pool = new Pool({ connectionString: DATABASE_URL });

// ── Helpers ──────────────────────────────────────────────────────────────────
function id() { return uuid(); }

function rj45Row(startCol, row, count, labelPrefix) {
  const blocks = [];
  for (let i = 0; i < count; i++) {
    blocks.push({ id: id(), type: 'rj45', col: startCol + i * 4, row, w: 3, h: 3, label: `${labelPrefix}${i + 1}` });
  }
  return blocks;
}

function sfpRow(startCol, row, count, labelPrefix, type = 'sfp+') {
  const blocks = [];
  for (let i = 0; i < count; i++) {
    blocks.push({ id: id(), type, col: startCol + i * 5, row, w: 4, h: 3, label: `${labelPrefix}${i + 1}` });
  }
  return blocks;
}

function qsfpRow(startCol, row, count, labelPrefix) {
  const blocks = [];
  for (let i = 0; i < count; i++) {
    blocks.push({ id: id(), type: 'qsfp28', col: startCol + i * 7, row, w: 6, h: 4, label: `${labelPrefix}${i + 1}` });
  }
  return blocks;
}

function bayRow35(startCol, row, count) {
  const blocks = [];
  for (let i = 0; i < count; i++) {
    blocks.push({ id: id(), type: 'bay-3.5', col: startCol + i * 23, row, w: 22, h: 7, label: `Bay ${i + 1}` });
  }
  return blocks;
}

function bayRow25(startCol, row, count) {
  const blocks = [];
  for (let i = 0; i < count; i++) {
    blocks.push({ id: id(), type: 'bay-2.5', col: startCol + i * 17, row, w: 16, h: 4, label: `Bay ${i + 1}` });
  }
  return blocks;
}

function pcieSlots(startCol, row, count, type = 'pcie-fh') {
  const blocks = [];
  const w = 5;
  const h = type === 'pcie-lp' ? 17 : 33;
  for (let i = 0; i < count; i++) {
    blocks.push({ id: id(), type, col: startCol + i * (w + 1), row, w, h, label: `PCIe ${i + 1}` });
  }
  return blocks;
}

// ── Template definitions ─────────────────────────────────────────────────────

function tpl1USwitch24() {
  // 1U 24-port Gigabit switch
  return {
    make: 'Cisco', model: 'SG350-24', category: 'switch',
    formFactor: 'rack', uHeight: 1, isShelf: false,
    layout: {
      front: [
        ...rj45Row(2, 1, 24, 'Gi0/'),
        { id: id(), type: 'sfp+', col: 2 + 24 * 4, row: 1, w: 4, h: 3, label: 'SFP+ 1' },
        { id: id(), type: 'sfp+', col: 2 + 24 * 4 + 5, row: 1, w: 4, h: 3, label: 'SFP+ 2' },
      ],
      rear: [
        { id: id(), type: 'power', col: 2, row: 2, w: 8, h: 6 },
      ],
    },
  };
}

function tpl1USwitch48() {
  // 1U 48-port switch
  const front = [];
  // Row 0: ports 1-24
  for (let i = 0; i < 24; i++) {
    front.push({ id: id(), type: 'rj45', col: 2 + i * 3, row: 0, w: 3, h: 3, label: `E${i + 1}` });
  }
  // Row 1: ports 25-48
  for (let i = 0; i < 24; i++) {
    front.push({ id: id(), type: 'rj45', col: 2 + i * 3, row: 4, w: 3, h: 3, label: `E${i + 25}` });
  }
  // SFP28 uplinks
  front.push({ id: id(), type: 'sfp28', col: 76, row: 0, w: 4, h: 3, label: 'UP1' });
  front.push({ id: id(), type: 'sfp28', col: 81, row: 0, w: 4, h: 3, label: 'UP2' });
  front.push({ id: id(), type: 'sfp28', col: 76, row: 4, w: 4, h: 3, label: 'UP3' });
  front.push({ id: id(), type: 'sfp28', col: 81, row: 4, w: 4, h: 3, label: 'UP4' });

  return {
    make: 'Arista', model: 'DCS-7050TX-48', category: 'switch',
    formFactor: 'rack', uHeight: 1, isShelf: false,
    layout: {
      front,
      rear: [{ id: id(), type: 'power', col: 2, row: 2, w: 8, h: 6 }, { id: id(), type: 'power', col: 12, row: 2, w: 8, h: 6 }],
    },
  };
}

function tpl2UServer() {
  // 2U server with 12x 3.5" bays, 2 PSU, 4 RJ45, IPMI, 3 PCIe
  return {
    make: 'Dell', model: 'PowerEdge R760', category: 'server',
    formFactor: 'rack', uHeight: 2, isShelf: false,
    layout: {
      front: [
        ...bayRow35(2, 2, 4),
        ...bayRow35(2, 10, 4),
      ],
      rear: [
        { id: id(), type: 'ipmi', col: 2, row: 2, w: 4, h: 4 },
        ...rj45Row(8, 2, 4, 'NIC'),
        { id: id(), type: 'usb-a', col: 24, row: 2, w: 3, h: 3 },
        { id: id(), type: 'vga', col: 28, row: 2, w: 6, h: 3 },
        ...pcieSlots(40, 0, 3, 'pcie-fh'),
        { id: id(), type: 'power', col: 80, row: 0, w: 8, h: 6 },
        { id: id(), type: 'power', col: 80, row: 8, w: 8, h: 6 },
      ],
    },
  };
}

function tpl1UServer() {
  // 1U server with 4x 2.5" bays, 2 NIC, IPMI
  return {
    make: 'Supermicro', model: 'SYS-1029P-WTR', category: 'server',
    formFactor: 'rack', uHeight: 1, isShelf: false,
    layout: {
      front: [
        ...bayRow25(2, 2, 4),
      ],
      rear: [
        { id: id(), type: 'ipmi', col: 2, row: 2, w: 4, h: 4 },
        ...rj45Row(8, 2, 2, 'NIC'),
        { id: id(), type: 'usb-a', col: 18, row: 2, w: 3, h: 3 },
        ...pcieSlots(24, 0, 2, 'pcie-lp'),
        { id: id(), type: 'power', col: 80, row: 0, w: 8, h: 6 },
        { id: id(), type: 'power', col: 80, row: 6, w: 8, h: 6 },
      ],
    },
  };
}

function tpl4UNAS() {
  // 4U NAS with 24x 3.5" bays
  const front = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      front.push({ id: id(), type: 'bay-3.5', col: 2 + col * 23, row: row * 12 + 2, w: 22, h: 7, label: `Bay ${row * 4 + col + 1}` });
    }
  }
  return {
    make: 'Synology', model: 'RS3621xs+', category: 'nas',
    formFactor: 'rack', uHeight: 4, isShelf: false,
    layout: {
      front,
      rear: [
        ...rj45Row(2, 2, 4, 'LAN'),
        { id: id(), type: 'usb-a', col: 20, row: 2, w: 3, h: 3 },
        { id: id(), type: 'usb-c', col: 24, row: 2, w: 3, h: 2 },
        ...pcieSlots(32, 0, 2, 'pcie-lp'),
        { id: id(), type: 'power', col: 80, row: 0, w: 8, h: 6 },
        { id: id(), type: 'power', col: 80, row: 10, w: 8, h: 6 },
      ],
    },
  };
}

function tpl1UFirewall() {
  // 1U firewall — 8 RJ45 + 2 SFP+
  return {
    make: 'Fortinet', model: 'FG-100F', category: 'firewall',
    formFactor: 'rack', uHeight: 1, isShelf: false,
    layout: {
      front: [
        ...rj45Row(2, 1, 8, 'P'),
        ...sfpRow(36, 1, 2, 'SFP'),
        { id: id(), type: 'usb-a', col: 50, row: 1, w: 3, h: 3 },
      ],
      rear: [
        { id: id(), type: 'power', col: 2, row: 2, w: 8, h: 6 },
      ],
    },
  };
}

function tpl1UPDU() {
  // 1U PDU
  return {
    make: 'APC', model: 'AP8641', category: 'pdu',
    formFactor: 'rack', uHeight: 1, isShelf: false,
    layout: {
      front: [],
      rear: [
        { id: id(), type: 'rj45', col: 2, row: 2, w: 3, h: 3, label: 'Mgmt' },
      ],
    },
  };
}

function tpl1UKVM() {
  // 1U KVM switch
  return {
    make: 'ATEN', model: 'KH1516Ai', category: 'kvm',
    formFactor: 'rack', uHeight: 1, isShelf: false,
    layout: {
      front: [
        { id: id(), type: 'usb-a', col: 2, row: 2, w: 3, h: 3, label: 'KB' },
        { id: id(), type: 'usb-a', col: 6, row: 2, w: 3, h: 3, label: 'Mouse' },
        { id: id(), type: 'vga', col: 12, row: 2, w: 6, h: 3, label: 'Mon' },
      ],
      rear: [
        { id: id(), type: 'rj45', col: 2, row: 2, w: 3, h: 3, label: 'Mgmt' },
      ],
    },
  };
}

function tpl1UPatchPanel() {
  // 1U 24-port patch panel
  return {
    make: 'Monoprice', model: 'PP-24-CAT6', category: 'patch-panel',
    formFactor: 'rack', uHeight: 1, isShelf: false,
    layout: {
      front: rj45Row(2, 1, 24, 'P'),
      rear: rj45Row(2, 1, 24, 'P'),
    },
  };
}

function tpl2UShelf() {
  // 2U rack shelf
  return {
    make: 'Navepoint', model: 'Shelf 2U', category: 'shelf',
    formFactor: 'rack', uHeight: 2, isShelf: true,
    gridCols: 96, gridRows: 24,
    layout: { front: [], rear: [] },
  };
}

function tplDesktopSwitch() {
  // Desktop 8-port switch (goes on shelf)
  return {
    make: 'Netgear', model: 'GS308E', category: 'switch',
    formFactor: 'desktop', uHeight: 1,
    gridCols: 48, gridRows: 12, isShelf: false,
    layout: {
      front: rj45Row(2, 2, 8, 'P'),
      rear: [{ id: id(), type: 'power', col: 2, row: 2, w: 8, h: 6 }],
    },
  };
}

function tplDesktopMiniPC() {
  // Desktop mini PC
  return {
    make: 'Intel', model: 'NUC12WSHi7', category: 'server',
    formFactor: 'desktop', uHeight: 1,
    gridCols: 48, gridRows: 12, isShelf: false,
    layout: {
      front: [
        { id: id(), type: 'usb-a', col: 2, row: 2, w: 3, h: 3, label: 'USB1' },
        { id: id(), type: 'usb-c', col: 6, row: 2, w: 3, h: 2, label: 'USB-C' },
      ],
      rear: [
        { id: id(), type: 'rj45', col: 2, row: 2, w: 3, h: 3, label: 'LAN' },
        { id: id(), type: 'hdmi', col: 7, row: 2, w: 4, h: 2, label: 'HDMI1' },
        { id: id(), type: 'hdmi', col: 12, row: 2, w: 4, h: 2, label: 'HDMI2' },
        { id: id(), type: 'usb-a', col: 18, row: 2, w: 3, h: 3, label: 'USB3' },
        { id: id(), type: 'usb-a', col: 22, row: 2, w: 3, h: 3, label: 'USB4' },
        { id: id(), type: 'power', col: 36, row: 2, w: 8, h: 6 },
      ],
    },
  };
}

function tplSpineSwitch() {
  // 1U 32-port QSFP28 spine switch
  return {
    make: 'Arista', model: 'DCS-7060CX-32S', category: 'switch',
    formFactor: 'rack', uHeight: 1, isShelf: false,
    layout: {
      front: [
        ...qsfpRow(2, 1, 8, 'Q'),
        ...qsfpRow(2, 6, 8, 'Q'),
      ],
      rear: [
        { id: id(), type: 'power', col: 2, row: 2, w: 8, h: 6 },
        { id: id(), type: 'power', col: 12, row: 2, w: 8, h: 6 },
        { id: id(), type: 'rj45', col: 24, row: 2, w: 3, h: 3, label: 'Mgmt' },
        { id: id(), type: 'usb-a', col: 28, row: 2, w: 3, h: 3, label: 'Console' },
      ],
    },
  };
}

// ── PCIe card templates ──────────────────────────────────────────────────────

function pcieDualSFP() {
  return {
    make: 'Mellanox', model: 'ConnectX-5 25GbE', busSize: 'x8', formFactor: 'fh', laneDepth: 1,
    layout: {
      rear: [
        { id: id(), type: 'sfp28', col: 0, row: 2, w: 4, h: 3, label: 'P0' },
        { id: id(), type: 'sfp28', col: 0, row: 6, w: 4, h: 3, label: 'P1' },
      ],
    },
  };
}

function pcieQuadRJ45() {
  return {
    make: 'Intel', model: 'I350-T4', busSize: 'x4', formFactor: 'lp', laneDepth: 1,
    layout: {
      rear: [
        { id: id(), type: 'rj45', col: 0, row: 0, w: 3, h: 3, label: 'P0' },
        { id: id(), type: 'rj45', col: 0, row: 4, w: 3, h: 3, label: 'P1' },
        { id: id(), type: 'rj45', col: 0, row: 8, w: 3, h: 3, label: 'P2' },
        { id: id(), type: 'rj45', col: 0, row: 12, w: 3, h: 3, label: 'P3' },
      ],
    },
  };
}

function pcieHBA() {
  return {
    make: 'Broadcom', model: 'MegaRAID 9560-8i', busSize: 'x8', formFactor: 'fh', laneDepth: 1,
    layout: {
      rear: [
        { id: id(), type: 'misc-small', col: 0, row: 4, w: 4, h: 4, label: 'SAS0' },
        { id: id(), type: 'misc-small', col: 0, row: 10, w: 4, h: 4, label: 'SAS1' },
      ],
    },
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    // Find org
    const { rows: [org] } = await client.query(`SELECT id FROM organizations LIMIT 1`);
    if (!org) throw new Error('No org found — run seed.js first');
    const orgId = org.id;

    console.log(`Using org: ${orgId}`);
    await client.query(`SET app.current_org_id = '${orgId}'`);

    // ── Create site ──────────────────────────────────────────────────────────
    const siteId = id();
    await client.query(
      `INSERT INTO sites (id, org_id, name, location, color, description) VALUES ($1,$2,$3,$4,$5,$6)`,
      [siteId, orgId, 'Stress Lab', 'Building 7, Floor 2', '#7090b8', 'Load testing site with 100+ devices']
    );
    console.log(`Site created: ${siteId}`);

    // ── Create zones ─────────────────────────────────────────────────────────
    const zoneNet = id();
    const zoneComp = id();
    await client.query(
      `INSERT INTO zones (id, org_id, site_id, name, description) VALUES ($1,$2,$3,$4,$5), ($6,$2,$3,$7,$8)`,
      [zoneNet, orgId, siteId, 'Network Zone', 'Core switching and routing',
       zoneComp, 'Compute Zone', 'Servers and storage']
    );
    console.log(`Zones created: Network + Compute`);

    // ── Create racks ─────────────────────────────────────────────────────────
    const rackIds = [];
    const rackDefs = [
      { name: 'Core-SW-1',  zone: zoneNet,  u: 42, watts: 3000 },
      { name: 'Core-SW-2',  zone: zoneNet,  u: 42, watts: 3000 },
      { name: 'Compute-A',  zone: zoneComp, u: 48, watts: 6000 },
      { name: 'Compute-B',  zone: zoneComp, u: 48, watts: 6000 },
      { name: 'Storage-NAS', zone: zoneComp, u: 42, watts: 4000 },
    ];
    for (const r of rackDefs) {
      const rid = id();
      rackIds.push(rid);
      await client.query(
        `INSERT INTO racks (id, org_id, site_id, zone_id, name, u_height, power_budget_watts) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [rid, orgId, siteId, r.zone, r.name, r.u, r.watts]
      );
    }
    console.log(`Racks created: ${rackDefs.map(r => r.name).join(', ')}`);

    // ── Create templates ─────────────────────────────────────────────────────
    async function insertTpl(def) {
      const tid = id();
      await client.query(
        `INSERT INTO device_templates (id, org_id, make, model, category, form_factor, u_height, grid_cols, grid_rows, layout, is_shelf)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tid, orgId, def.make, def.model, def.category, def.formFactor, def.uHeight,
         def.gridCols ?? 96, def.gridRows ?? (def.uHeight * 12), JSON.stringify(def.layout), def.isShelf ?? false]
      );
      return tid;
    }

    async function insertPcieTpl(def) {
      const tid = id();
      await client.query(
        `INSERT INTO pcie_card_templates (id, org_id, make, model, bus_size, form_factor, lane_depth, layout)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tid, orgId, def.make, def.model, def.busSize, def.formFactor, def.laneDepth ?? 1, JSON.stringify(def.layout)]
      );
      return tid;
    }

    const tplSwitch24   = await insertTpl(tpl1USwitch24());
    const tplSwitch48   = await insertTpl(tpl1USwitch48());
    const tplServer2U   = await insertTpl(tpl2UServer());
    const tplServer1U   = await insertTpl(tpl1UServer());
    const tplNAS4U      = await insertTpl(tpl4UNAS());
    const tplFirewall   = await insertTpl(tpl1UFirewall());
    const tplPDU        = await insertTpl(tpl1UPDU());
    const tplKVM        = await insertTpl(tpl1UKVM());
    const tplPatchPanel = await insertTpl(tpl1UPatchPanel());
    const tplShelf2U    = await insertTpl(tpl2UShelf());
    const tplDeskSwitch = await insertTpl(tplDesktopSwitch());
    const tplMiniPC     = await insertTpl(tplDesktopMiniPC());
    const tplSpine      = await insertTpl(tplSpineSwitch());
    console.log(`Device templates created: 13`);

    const pcieSFP  = await insertPcieTpl(pcieDualSFP());
    const pcieRJ45 = await insertPcieTpl(pcieQuadRJ45());
    const pcieHBAId = await insertPcieTpl(pcieHBA());
    console.log(`PCIe templates created: 3`);

    // ── Helper to create device ──────────────────────────────────────────────
    const allDevices = [];
    async function mkDevice(name, typeId, templateId, rackId, rackU, uHeight, face = 'front', extra = {}) {
      const did = id();
      const zoneId = extra.zoneId ?? rackDefs[rackIds.indexOf(rackId)]?.zone ?? null;
      await client.query(
        `INSERT INTO device_instances
           (id, org_id, site_id, zone_id, rack_id, template_id, type_id, name, rack_u, u_height, face, ip, serial, asset_tag, is_draft, shelf_device_id, shelf_col, shelf_row)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [did, orgId, siteId, zoneId, extra.shelfDeviceId ? null : rackId, templateId, typeId, name,
         extra.shelfDeviceId ? null : rackU,
         uHeight, face,
         extra.ip ?? null, extra.serial ?? null, extra.assetTag ?? null, false,
         extra.shelfDeviceId ?? null, extra.shelfCol ?? null, extra.shelfRow ?? null]
      );
      allDevices.push({ id: did, name, templateId, typeId, rackId });
      return did;
    }

    // ── Rack 1: Core-SW-1 (Network) ─────────────────────────────────────────
    let devCount = 0;
    const [rk1, rk2, rk3, rk4, rk5] = rackIds;

    // Patch panels at top
    const pp1 = await mkDevice('PP-1A', 'dt-patch-panel', tplPatchPanel, rk1, 42, 1);
    const pp2 = await mkDevice('PP-1B', 'dt-patch-panel', tplPatchPanel, rk1, 41, 1);
    // Spine switches
    await mkDevice('Spine-1', 'dt-switch', tplSpine, rk1, 39, 1, 'front', { ip: '10.0.0.1' });
    await mkDevice('Spine-2', 'dt-switch', tplSpine, rk1, 38, 1, 'front', { ip: '10.0.0.2' });
    // Leaf switches
    for (let i = 1; i <= 6; i++) {
      await mkDevice(`Leaf-1-${i}`, 'dt-switch', tplSwitch48, rk1, 38 - i, 1, 'front', { ip: `10.0.1.${i}` });
    }
    // Firewall
    await mkDevice('FW-Primary', 'dt-firewall', tplFirewall, rk1, 30, 1, 'front', { ip: '10.0.0.254' });
    await mkDevice('FW-Secondary', 'dt-firewall', tplFirewall, rk1, 29, 1, 'front', { ip: '10.0.0.253' });
    // PDUs
    await mkDevice('PDU-1A', 'dt-pdu', tplPDU, rk1, 2, 1, 'rear');
    await mkDevice('PDU-1B', 'dt-pdu', tplPDU, rk1, 1, 1, 'rear');
    devCount += 12;

    // ── Rack 2: Core-SW-2 (Network) ──────────────────────────────────────────
    const pp3 = await mkDevice('PP-2A', 'dt-patch-panel', tplPatchPanel, rk2, 42, 1);
    const pp4 = await mkDevice('PP-2B', 'dt-patch-panel', tplPatchPanel, rk2, 41, 1);
    for (let i = 1; i <= 4; i++) {
      await mkDevice(`Leaf-2-${i}`, 'dt-switch', tplSwitch24, rk2, 41 - i, 1, 'front', { ip: `10.0.2.${i}` });
    }
    // KVM
    await mkDevice('KVM-1', 'dt-kvm', tplKVM, rk2, 35, 1);
    // Shelf with desktop switches
    const shelf1 = await mkDevice('Shelf-2A', 'dt-shelf', tplShelf2U, rk2, 33, 2);
    await mkDevice('DeskSW-1', 'dt-switch', tplDeskSwitch, null, null, 1, 'front', { shelfDeviceId: shelf1, shelfCol: 0, shelfRow: 0, zoneId: zoneNet });
    await mkDevice('DeskSW-2', 'dt-switch', tplDeskSwitch, null, null, 1, 'front', { shelfDeviceId: shelf1, shelfCol: 48, shelfRow: 0, zoneId: zoneNet });
    // Another shelf
    const shelf2 = await mkDevice('Shelf-2B', 'dt-shelf', tplShelf2U, rk2, 31, 2);
    await mkDevice('DeskSW-3', 'dt-switch', tplDeskSwitch, null, null, 1, 'front', { shelfDeviceId: shelf2, shelfCol: 0, shelfRow: 0, zoneId: zoneNet });
    await mkDevice('DeskSW-4', 'dt-switch', tplDeskSwitch, null, null, 1, 'front', { shelfDeviceId: shelf2, shelfCol: 48, shelfRow: 0, zoneId: zoneNet });
    await mkDevice('PDU-2A', 'dt-pdu', tplPDU, rk2, 2, 1, 'rear');
    await mkDevice('PDU-2B', 'dt-pdu', tplPDU, rk2, 1, 1, 'rear');
    devCount += 14;

    // ── Rack 3: Compute-A ────────────────────────────────────────────────────
    // 2U servers filling up the rack
    const serverIds3 = [];
    for (let i = 0; i < 16; i++) {
      const u = 48 - (i * 2) - 1; // top-down, 2U each
      const sid = await mkDevice(`Srv-A${(i + 1).toString().padStart(2, '0')}`, 'dt-server', tplServer2U, rk3, u, 2, 'front', {
        ip: `10.1.1.${10 + i}`, serial: `SRV3-${(1000 + i).toString()}`, assetTag: `WS-A${(i + 1).toString().padStart(3, '0')}`,
      });
      serverIds3.push(sid);
    }
    // PDUs at bottom
    await mkDevice('PDU-3A', 'dt-pdu', tplPDU, rk3, 2, 1, 'rear');
    await mkDevice('PDU-3B', 'dt-pdu', tplPDU, rk3, 1, 1, 'rear');
    // Patch panel at top
    await mkDevice('PP-3A', 'dt-patch-panel', tplPatchPanel, rk3, 48, 1);
    devCount += 19;

    // ── Rack 4: Compute-B (1U servers + shelf with mini PCs) ─────────────────
    const serverIds4 = [];
    for (let i = 0; i < 20; i++) {
      const u = 48 - i;
      const sid = await mkDevice(`Srv-B${(i + 1).toString().padStart(2, '0')}`, 'dt-server', tplServer1U, rk4, u, 1, 'front', {
        ip: `10.1.2.${10 + i}`, serial: `SRV4-${(2000 + i).toString()}`, assetTag: `WS-B${(i + 1).toString().padStart(3, '0')}`,
      });
      serverIds4.push(sid);
    }
    // Shelf with mini PCs
    const shelf3 = await mkDevice('Shelf-4A', 'dt-shelf', tplShelf2U, rk4, 27, 2);
    for (let i = 0; i < 4; i++) {
      await mkDevice(`MiniPC-${i + 1}`, 'dt-server', tplMiniPC, null, null, 1, 'front', {
        shelfDeviceId: shelf3, shelfCol: i * 24, shelfRow: 0, zoneId: zoneComp,
        ip: `10.1.2.${50 + i}`,
      });
    }
    // PDUs
    await mkDevice('PDU-4A', 'dt-pdu', tplPDU, rk4, 2, 1, 'rear');
    await mkDevice('PDU-4B', 'dt-pdu', tplPDU, rk4, 1, 1, 'rear');
    await mkDevice('PP-4A', 'dt-patch-panel', tplPatchPanel, rk4, 25, 1);
    devCount += 28;

    // ── Rack 5: Storage-NAS ──────────────────────────────────────────────────
    const nasIds = [];
    for (let i = 0; i < 6; i++) {
      const u = 42 - (i * 4) - 3;
      const nid = await mkDevice(`NAS-${i + 1}`, 'dt-nas', tplNAS4U, rk5, u, 4, 'front', {
        ip: `10.1.3.${10 + i}`, serial: `NAS5-${(3000 + i).toString()}`,
      });
      nasIds.push(nid);
    }
    // A couple switches for storage network
    await mkDevice('StorSW-1', 'dt-switch', tplSwitch24, rk5, 17, 1, 'front', { ip: '10.1.3.1' });
    await mkDevice('StorSW-2', 'dt-switch', tplSwitch24, rk5, 16, 1, 'front', { ip: '10.1.3.2' });
    // Shelf with desktop switches
    const shelf4 = await mkDevice('Shelf-5A', 'dt-shelf', tplShelf2U, rk5, 14, 2);
    await mkDevice('DeskSW-5', 'dt-switch', tplDeskSwitch, null, null, 1, 'front', { shelfDeviceId: shelf4, shelfCol: 0, shelfRow: 0, zoneId: zoneComp });
    await mkDevice('DeskSW-6', 'dt-switch', tplDeskSwitch, null, null, 1, 'front', { shelfDeviceId: shelf4, shelfCol: 48, shelfRow: 0, zoneId: zoneComp });
    // PDUs
    await mkDevice('PDU-5A', 'dt-pdu', tplPDU, rk5, 2, 1, 'rear');
    await mkDevice('PDU-5B', 'dt-pdu', tplPDU, rk5, 1, 1, 'rear');
    devCount += 12;

    console.log(`Devices created: ${devCount} (${allDevices.length} total)`);

    // ── Install PCIe cards into servers ──────────────────────────────────────
    let pcieCount = 0;

    // Helper: get PCIe slot block IDs from a template
    function getPcieSlots(templateId) {
      // We need to look up the template we just created
      const tplDef = templateId === tplServer2U ? tpl2UServer() :
                     templateId === tplServer1U ? tpl1UServer() :
                     templateId === tplNAS4U ? tpl4UNAS() : null;
      if (!tplDef) return [];
      return tplDef.layout.rear.filter(b => b.type.startsWith('pcie-')).map(b => b.id);
    }

    // We need to re-read the template layouts from DB since we generated new IDs
    async function getSlotIdsFromDB(templateId) {
      const { rows } = await client.query(
        `SELECT layout FROM device_templates WHERE id = $1`, [templateId]
      );
      if (!rows[0]) return [];
      const layout = typeof rows[0].layout === 'string' ? JSON.parse(rows[0].layout) : rows[0].layout;
      return layout.rear.filter(b => b.type && b.type.startsWith('pcie-')).map(b => b.id);
    }

    // Install dual SFP28 cards in first 8 2U servers
    for (let i = 0; i < 8 && i < serverIds3.length; i++) {
      const slots = await getSlotIdsFromDB(tplServer2U);
      if (slots.length > 0) {
        await client.query(
          `INSERT INTO module_instances (id, device_id, slot_block_id, card_template_id, serial_number)
           VALUES ($1, $2, $3, $4, $5)`,
          [id(), serverIds3[i], slots[0], pcieSFP, `MLX-${1000 + i}`]
        );
        pcieCount++;
      }
      // HBA in second slot for even-numbered servers
      if (i % 2 === 0 && slots.length > 1) {
        await client.query(
          `INSERT INTO module_instances (id, device_id, slot_block_id, card_template_id, serial_number)
           VALUES ($1, $2, $3, $4, $5)`,
          [id(), serverIds3[i], slots[1], pcieHBAId, `HBA-${2000 + i}`]
        );
        pcieCount++;
      }
    }

    // Install quad RJ45 cards in first 10 1U servers
    for (let i = 0; i < 10 && i < serverIds4.length; i++) {
      const slots = await getSlotIdsFromDB(tplServer1U);
      if (slots.length > 0) {
        await client.query(
          `INSERT INTO module_instances (id, device_id, slot_block_id, card_template_id, serial_number)
           VALUES ($1, $2, $3, $4, $5)`,
          [id(), serverIds4[i], slots[0], pcieRJ45, `I350-${3000 + i}`]
        );
        pcieCount++;
      }
    }

    // Install dual SFP in NAS units
    for (let i = 0; i < nasIds.length; i++) {
      const slots = await getSlotIdsFromDB(tplNAS4U);
      if (slots.length > 0) {
        await client.query(
          `INSERT INTO module_instances (id, device_id, slot_block_id, card_template_id, serial_number)
           VALUES ($1, $2, $3, $4, $5)`,
          [id(), nasIds[i], slots[0], pcieSFP, `MLX-NAS-${4000 + i}`]
        );
        pcieCount++;
      }
    }
    console.log(`PCIe modules installed: ${pcieCount}`);

    // ── Create connections (cables) ──────────────────────────────────────────
    let connCount = 0;

    // Helper: get port block IDs from a template layout in DB
    async function getPortBlocksFromDB(templateId, panel) {
      const { rows } = await client.query(
        `SELECT layout FROM device_templates WHERE id = $1`, [templateId]
      );
      if (!rows[0]) return [];
      const layout = typeof rows[0].layout === 'string' ? JSON.parse(rows[0].layout) : rows[0].layout;
      const portTypes = new Set(['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp', 'qsfp28', 'ipmi']);
      return layout[panel].filter(b => portTypes.has(b.type));
    }

    async function mkConn(srcDevId, srcBlock, dstDevId, dstBlock, cableTypeId, label) {
      await client.query(
        `INSERT INTO connections (id, org_id, site_id, src_device_id, src_port, src_block_id, src_block_type,
                                  dst_device_id, dst_port, dst_block_id, dst_block_type, cable_type_id, label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [id(), orgId, siteId, srcDevId, srcBlock.label ?? srcBlock.type, srcBlock.id, srcBlock.type,
         dstDevId, dstBlock.label ?? dstBlock.type, dstBlock.id, dstBlock.type, cableTypeId, label]
      );
      connCount++;
    }

    // Connect servers in Rack 3 to Leaf switches in Rack 1 (NIC1 → Leaf port)
    const leafDevices = allDevices.filter(d => d.name.startsWith('Leaf-1-'));
    for (let i = 0; i < serverIds3.length && i < 16; i++) {
      const serverPorts = await getPortBlocksFromDB(tplServer2U, 'rear');
      const nicPorts = serverPorts.filter(b => b.type === 'rj45');
      if (nicPorts.length === 0) continue;

      const leafIdx = i % leafDevices.length;
      const leafPorts = await getPortBlocksFromDB(tplSwitch48, 'front');
      const leafPort = leafPorts[i % leafPorts.length];
      if (!leafPort) continue;

      await mkConn(serverIds3[i], nicPorts[0], leafDevices[leafIdx].id, leafPort, 'cable-cat6a', `srv-a${i + 1}-uplink`);
    }

    // Connect servers in Rack 4 to Leaf switches in Rack 2 (NIC1 → Leaf port)
    const leaf2Devices = allDevices.filter(d => d.name.startsWith('Leaf-2-'));
    for (let i = 0; i < Math.min(serverIds4.length, 20); i++) {
      const serverPorts = await getPortBlocksFromDB(tplServer1U, 'rear');
      const nicPorts = serverPorts.filter(b => b.type === 'rj45');
      if (nicPorts.length === 0) continue;

      const leafIdx = i % leaf2Devices.length;
      const leafPorts = await getPortBlocksFromDB(tplSwitch24, 'front');
      const leafPort = leafPorts[i % leafPorts.length];
      if (!leafPort) continue;

      await mkConn(serverIds4[i], nicPorts[0], leaf2Devices[leafIdx].id, leafPort, 'cable-cat6', `srv-b${i + 1}-uplink`);
    }

    // Connect NAS units to storage switches (RJ45 ports → StorSW)
    const storSW = allDevices.filter(d => d.name.startsWith('StorSW'));
    for (let i = 0; i < nasIds.length; i++) {
      const nasPorts = await getPortBlocksFromDB(tplNAS4U, 'rear');
      const rj45Ports = nasPorts.filter(b => b.type === 'rj45');
      if (rj45Ports.length < 2) continue;

      const sw1Ports = await getPortBlocksFromDB(tplSwitch24, 'front');
      if (storSW[0] && sw1Ports[i]) {
        await mkConn(nasIds[i], rj45Ports[0], storSW[0].id, sw1Ports[i], 'cable-cat6a', `nas${i + 1}-bond0`);
      }
      if (storSW[1] && sw1Ports[i]) {
        await mkConn(nasIds[i], rj45Ports[1], storSW[1].id, sw1Ports[i], 'cable-cat6a', `nas${i + 1}-bond1`);
      }
    }

    // A few fiber connections between spine and leaf switches (SFP28 uplinks)
    const spines = allDevices.filter(d => d.name.startsWith('Spine'));
    for (let i = 0; i < leafDevices.length; i++) {
      const leafPorts = await getPortBlocksFromDB(tplSwitch48, 'front');
      const sfpPorts = leafPorts.filter(b => b.type === 'sfp28');
      const spinePorts = await getPortBlocksFromDB(tplSpine, 'front');
      if (sfpPorts[0] && spinePorts[i] && spines[0]) {
        await mkConn(leafDevices[i].id, sfpPorts[0], spines[0].id, spinePorts[i], 'cable-fiber-sm', `leaf1-${i + 1}-spine1`);
      }
      if (sfpPorts[1] && spinePorts[i + 8] && spines[1]) {
        await mkConn(leafDevices[i].id, sfpPorts[1], spines[1].id, spinePorts[i + 8] ?? spinePorts[i], 'cable-fiber-sm', `leaf1-${i + 1}-spine2`);
      }
    }

    console.log(`Connections created: ${connCount}`);

    // ── Create drives for NAS units ──────────────────────────────────────────
    let driveCount = 0;
    for (let n = 0; n < nasIds.length; n++) {
      const bayBlocks = (await (async () => {
        const { rows } = await client.query(`SELECT layout FROM device_templates WHERE id = $1`, [tplNAS4U]);
        const layout = typeof rows[0].layout === 'string' ? JSON.parse(rows[0].layout) : rows[0].layout;
        return layout.front.filter(b => b.type === 'bay-3.5');
      })());

      for (let b = 0; b < bayBlocks.length; b++) {
        await client.query(
          `INSERT INTO drives (id, org_id, site_id, device_id, slot_block_id, label, capacity, drive_type, serial)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id(), orgId, siteId, nasIds[n], bayBlocks[b].id,
           `NAS${n + 1}-D${b + 1}`,
           b % 3 === 0 ? '16TB' : b % 3 === 1 ? '8TB' : '4TB',
           'hdd',
           `WDC-${5000 + n * 100 + b}`]
        );
        driveCount++;
      }
    }
    console.log(`Drives created: ${driveCount}`);

    // ── Subnets ──────────────────────────────────────────────────────────────
    const subnets = [
      { cidr: '10.0.0.0/24',  name: 'Management',    vlan: 1 },
      { cidr: '10.1.1.0/24',  name: 'Compute-A',     vlan: 100 },
      { cidr: '10.1.2.0/24',  name: 'Compute-B',     vlan: 200 },
      { cidr: '10.1.3.0/24',  name: 'Storage',        vlan: 300 },
      { cidr: '192.168.1.0/24', name: 'User LAN',     vlan: 10 },
    ];
    for (const s of subnets) {
      await client.query(
        `INSERT INTO subnets (id, org_id, site_id, cidr, name, vlan) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id(), orgId, siteId, s.cidr, s.name, s.vlan]
      );
    }
    console.log(`Subnets created: ${subnets.length}`);

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n╔════════════════════════════════════════╗');
    console.log(`║  Stress seed complete                  ║`);
    console.log(`║  Site:        Stress Lab               ║`);
    console.log(`║  Zones:       2                        ║`);
    console.log(`║  Racks:       ${rackDefs.length}                        ║`);
    console.log(`║  Devices:     ${allDevices.length.toString().padEnd(24)}║`);
    console.log(`║  PCIe cards:  ${pcieCount.toString().padEnd(24)}║`);
    console.log(`║  Connections: ${connCount.toString().padEnd(24)}║`);
    console.log(`║  Drives:      ${driveCount.toString().padEnd(24)}║`);
    console.log(`║  Subnets:     ${subnets.length}                        ║`);
    console.log('╚════════════════════════════════════════╝');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Stress seed failed:', err);
  process.exit(1);
});
