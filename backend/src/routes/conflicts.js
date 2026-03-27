'use strict';

const express = require('express');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function withOrg(db, orgId, fn) {
  const client = await db.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

// Port-type categories for medium-mismatch detection
const COPPER_TYPES  = new Set(['rj45', 'sfp-copper']);
const FIBER_TYPES   = new Set(['sfp', 'sfp+', 'sfp28', 'qsfp', 'qsfp28', 'sfp-fiber']);
const SPEED_MAP     = { sfp: 1, 'sfp+': 10, sfp28: 25, qsfp: 40, qsfp28: 100 };

function isMediumMismatch(typeA, typeB) {
  if (!typeA || !typeB) return false;
  const aCopper = COPPER_TYPES.has(typeA);
  const bCopper = COPPER_TYPES.has(typeB);
  const aFiber  = FIBER_TYPES.has(typeA);
  const bFiber  = FIBER_TYPES.has(typeB);
  // copper ↔ fiber is a mismatch
  if ((aCopper && bFiber) || (aFiber && bCopper)) return true;
  // sfp speed mismatch (e.g. sfp+ ↔ qsfp)
  const aSpeed = SPEED_MAP[typeA];
  const bSpeed = SPEED_MAP[typeB];
  if (aSpeed && bSpeed && aSpeed !== bSpeed) return true;
  return false;
}

// ── Route factory ─────────────────────────────────────────────────────────────

module.exports = function conflictsRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/sites/:siteId/conflicts
  // Returns all 6 conflict types for the site
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;

    try {
      const result = await withOrg(db, orgId, async (c) => {

        // ── 1. Spatial conflicts ─────────────────────────────────────────────
        // Devices in the same rack + face whose U ranges overlap
        const spatialRes = await c.query(
          `SELECT a.id AS a_id, a.name AS a_name, a.rack_u AS a_rack_u, a.u_height AS a_u,
                  b.id AS b_id, b.name AS b_name, b.rack_u AS b_rack_u, b.u_height AS b_u,
                  r.name AS rack_name, a.face
           FROM device_instances a
           JOIN device_instances b ON b.rack_id = a.rack_id
             AND b.face = a.face
             AND b.id > a.id
             AND b.rack_u IS NOT NULL AND a.rack_u IS NOT NULL
             AND b.u_height IS NOT NULL AND a.u_height IS NOT NULL
             AND (a.rack_u + a.u_height - 1) >= b.rack_u
             AND a.rack_u <= (b.rack_u + b.u_height - 1)
           JOIN racks r ON r.id = a.rack_id
           WHERE a.site_id = $1 AND a.org_id = $2`,
          [siteId, orgId]
        );

        const spatialConflicts = spatialRes.rows.map(r => ({
          type:     'spatial',
          level:    'error',
          message:  `"${r.a_name}" and "${r.b_name}" overlap at U${r.a_rack_u} in rack "${r.rack_name}" (${r.face} face)`,
          deviceA:  { id: r.a_id, name: r.a_name, rackU: r.a_rack_u, uHeight: r.a_u },
          deviceB:  { id: r.b_id, name: r.b_name, rackU: r.b_rack_u, uHeight: r.b_u },
          rackName: r.rack_name,
          face:     r.face,
        }));

        // ── 2. Power overload ────────────────────────────────────────────────
        // Racks exceeding 80% (warn) or 100% (error) of power_budget_watts
        const powerRes = await c.query(
          `SELECT r.id AS rack_id, r.name AS rack_name, r.power_budget_watts,
                  COALESCE(SUM(dt.wattage_max), 0)::integer AS used_watts
           FROM racks r
           LEFT JOIN device_instances di ON di.rack_id = r.id AND di.org_id = r.org_id
           LEFT JOIN device_templates dt ON dt.id = di.template_id
           WHERE r.site_id = $1 AND r.org_id = $2 AND r.power_budget_watts IS NOT NULL
           GROUP BY r.id, r.name, r.power_budget_watts`,
          [siteId, orgId]
        );

        const powerConflicts = [];
        for (const r of powerRes.rows) {
          const pct = r.power_budget_watts > 0
            ? Math.round((r.used_watts / r.power_budget_watts) * 100)
            : 0;
          if (pct >= 100) {
            powerConflicts.push({
              type:    'power',
              level:   'error',
              message: `Rack "${r.rack_name}" is at ${pct}% power capacity (${r.used_watts}W / ${r.power_budget_watts}W)`,
              rackId:   r.rack_id,
              rackName: r.rack_name,
              usedWatts:   r.used_watts,
              budgetWatts: r.power_budget_watts,
              percent:     pct,
            });
          } else if (pct >= 80) {
            powerConflicts.push({
              type:    'power',
              level:   'warn',
              message: `Rack "${r.rack_name}" is at ${pct}% power capacity (${r.used_watts}W / ${r.power_budget_watts}W)`,
              rackId:   r.rack_id,
              rackName: r.rack_name,
              usedWatts:   r.used_watts,
              budgetWatts: r.power_budget_watts,
              percent:     pct,
            });
          }
        }

        // ── 3. IP conflicts ──────────────────────────────────────────────────
        // Duplicate IP addresses within the same subnet
        const ipRes = await c.query(
          `SELECT ip, subnet_id, COUNT(*) AS cnt,
                  array_agg(id) AS ids, array_agg(COALESCE(label, device_id::text)) AS labels,
                  s.cidr AS subnet_cidr
           FROM ip_assignments ia
           JOIN subnets s ON s.id = ia.subnet_id
           WHERE ia.site_id = $1 AND ia.org_id = $2
           GROUP BY ip, subnet_id, s.cidr
           HAVING COUNT(*) > 1`,
          [siteId, orgId]
        );

        const ipConflicts = ipRes.rows.map(r => ({
          type:       'ip',
          level:      'error',
          message:    `IP ${r.ip} is assigned ${r.cnt} times in subnet ${r.subnet_cidr}`,
          ip:         r.ip,
          subnetCidr: r.subnet_cidr,
          count:      parseInt(r.cnt, 10),
        }));

        // ── 4. Medium mismatches ─────────────────────────────────────────────
        // Connections linking incompatible port types (e.g. SFP+ to RJ45)
        const connRes = await c.query(
          `SELECT c.id, c.src_block_type, c.dst_block_type,
                  c.label, c.src_port, c.dst_port,
                  da.name AS src_name, db.name AS dst_name
           FROM connections c
           JOIN device_instances da ON da.id = c.src_device_id
           JOIN device_instances db ON db.id = c.dst_device_id
           WHERE c.site_id = $1 AND c.org_id = $2
             AND c.src_block_type IS NOT NULL AND c.dst_block_type IS NOT NULL`,
          [siteId, orgId]
        );

        const mediumMismatches = connRes.rows
          .filter(r => isMediumMismatch(r.src_block_type, r.dst_block_type))
          .map(r => ({
            type:    'medium',
            level:   'warn',
            message: `Medium mismatch: "${r.src_name}" (${r.src_block_type}) → "${r.dst_name}" (${r.dst_block_type})${r.label ? ` [${r.label}]` : ''}`,
            connectionId: r.id,
            srcName:      r.src_name,
            dstName:      r.dst_name,
            srcBlockType: r.src_block_type,
            dstBlockType: r.dst_block_type,
          }));

        // ── 5. Inventory shortages ───────────────────────────────────────────
        const ledgerRes = await c.query(
          `SELECT name, quantity, reserved FROM ledger_items
           WHERE site_id = $1 AND org_id = $2 AND reserved > quantity`,
          [siteId, orgId]
        );

        const inventoryShortages = ledgerRes.rows.map(r => ({
          type:      'inventory',
          level:     'warn',
          message:   `Inventory shortage: "${r.name}" needs ${r.reserved}, only ${r.quantity} available`,
          name:      r.name,
          needed:    r.reserved,
          available: r.quantity,
        }));

        // ── 6. Loop detection ────────────────────────────────────────────────
        // Devices connected to themselves (self-loop)
        const selfLoopRes = await c.query(
          `SELECT c.id, da.name AS device_name, c.src_port, c.dst_port
           FROM connections c
           JOIN device_instances da ON da.id = c.src_device_id
           WHERE c.site_id = $1 AND c.org_id = $2
             AND c.src_device_id = c.dst_device_id`,
          [siteId, orgId]
        );

        // Duplicate connections (same device pair, same ports)
        const dupConnRes = await c.query(
          `SELECT src_device_id, dst_device_id,
                  src_port, dst_port,
                  COUNT(*) AS cnt,
                  array_agg(id) AS ids,
                  da.name AS src_name, db.name AS dst_name
           FROM connections c
           JOIN device_instances da ON da.id = c.src_device_id
           JOIN device_instances db ON db.id = c.dst_device_id
           WHERE c.site_id = $1 AND c.org_id = $2
             AND c.src_device_id != c.dst_device_id
           GROUP BY src_device_id, dst_device_id, src_port, dst_port, da.name, db.name
           HAVING COUNT(*) > 1`,
          [siteId, orgId]
        );

        const loopConflicts = [
          ...selfLoopRes.rows.map(r => ({
            type:    'loop',
            level:   'error',
            message: `Self-loop detected: "${r.device_name}" port "${r.src_port || '?'}" connected to itself`,
            connectionId: r.id,
            deviceName:   r.device_name,
          })),
          ...dupConnRes.rows.map(r => ({
            type:    'loop',
            level:   'warn',
            message: `Duplicate connection: "${r.src_name}" → "${r.dst_name}" (${r.cnt}× on same ports)`,
            count:   parseInt(r.cnt, 10),
            srcName: r.src_name,
            dstName: r.dst_name,
          })),
        ];

        return {
          spatialConflicts,
          powerConflicts,
          ipConflicts,
          mediumMismatches,
          inventoryShortages,
          loopConflicts,
          totalErrors:   [spatialConflicts, powerConflicts.filter(p => p.level === 'error'), ipConflicts, loopConflicts.filter(l => l.level === 'error')].flat().length,
          totalWarnings: [powerConflicts.filter(p => p.level === 'warn'), mediumMismatches, inventoryShortages, loopConflicts.filter(l => l.level === 'warn')].flat().length,
        };
      });

      res.json(result);
    } catch (err) {
      console.error('[GET /conflicts]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
