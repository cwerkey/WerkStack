'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ── Validation schemas ────────────────────────────────────────────────────────

const PromotionSchema = z.object({
  deviceIds: z.array(z.string().uuid()).min(1),
});

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

// ── Route factory ─────────────────────────────────────────────────────────────

module.exports = function blueprintRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/sites/:siteId/blueprints/summary
  // BOM generation, power/space projections for all draft devices
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/summary', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;

    try {
      const result = await withOrg(db, orgId, async (c) => {
        // Get all draft devices with their templates
        const draftsRes = await c.query(
          `SELECT di.id, di.name, di.template_id, di.u_height,
                  dt.make, dt.model, dt.wattage_max, dt.u_height AS tmpl_u
           FROM device_instances di
           LEFT JOIN device_templates dt ON dt.id = di.template_id
           WHERE di.site_id = $1 AND di.org_id = $2 AND di.is_draft = true`,
          [siteId, orgId]
        );

        const drafts = draftsRes.rows;

        // Build BOM — group by template
        const bomMap = new Map();
        let totalWatts = 0;
        let totalU = 0;

        for (const d of drafts) {
          const key = d.template_id || `no-template:${d.name}`;
          if (!bomMap.has(key)) {
            bomMap.set(key, {
              templateId:   d.template_id || key,
              templateName: d.template_id ? `${d.make} ${d.model}` : d.name,
              make:         d.make || '',
              model:        d.model || '',
              count:        0,
              wattageEach:  d.wattage_max || 0,
              wattageTotal: 0,
            });
          }
          const entry = bomMap.get(key);
          entry.count += 1;
          entry.wattageTotal += (d.wattage_max || 0);
          totalWatts += (d.wattage_max || 0);
          totalU += (d.u_height || d.tmpl_u || 0);
        }

        // Check resource ledger for missing items
        const ledgerRes = await c.query(
          `SELECT name, quantity, reserved FROM ledger_items
           WHERE site_id = $1 AND org_id = $2`,
          [siteId, orgId]
        );

        const missingLedger = [];
        for (const item of ledgerRes.rows) {
          const available = item.quantity - item.reserved;
          if (available < 0) {
            missingLedger.push({
              name:      item.name,
              needed:    item.reserved,
              available: item.quantity,
            });
          }
        }

        return {
          totalDrafts:   drafts.length,
          totalWatts,
          totalU,
          bom:           Array.from(bomMap.values()),
          missingLedger,
        };
      });

      res.json(result);
    } catch (err) {
      console.error('[GET /blueprints/summary]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/sites/:siteId/blueprints/drafts
  // List all draft device instances
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/drafts', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM device_instances
           WHERE site_id = $1 AND org_id = $2 AND is_draft = true
           ORDER BY created_at`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toDevice));
    } catch (err) {
      console.error('[GET /blueprints/drafts]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/sites/:siteId/blueprints/promote
  // Promotion Wizard — BOM checklist → inventory check → commit
  // Promotes draft devices to active (is_draft = false)
  // ═══════════════════════════════════════════════════════════════════════════

  router.post(
    '/promote',
    requireRole('member'), validate(PromotionSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      const { deviceIds } = req.body;

      try {
        const result = await withOrg(db, orgId, async (c) => {
          // Begin transaction for atomicity
          await c.query('BEGIN');

          try {
            // Verify all devices are drafts belonging to this site
            const verify = await c.query(
              `SELECT id, name, is_draft FROM device_instances
               WHERE id = ANY($1) AND site_id = $2 AND org_id = $3`,
              [deviceIds, siteId, orgId]
            );

            if (verify.rows.length !== deviceIds.length) {
              await c.query('ROLLBACK');
              return { error: 'one or more devices not found', status: 404 };
            }

            const nonDraft = verify.rows.filter(d => !d.is_draft);
            if (nonDraft.length > 0) {
              await c.query('ROLLBACK');
              return {
                error: `devices already promoted: ${nonDraft.map(d => d.name).join(', ')}`,
                status: 400,
              };
            }

            // Promote: set is_draft = false
            await c.query(
              `UPDATE device_instances SET is_draft = false
               WHERE id = ANY($1) AND site_id = $2 AND org_id = $3`,
              [deviceIds, siteId, orgId]
            );

            // Unreserve any ledger reservations for promoted drafts
            await c.query(
              `UPDATE ledger_items li
               SET reserved = GREATEST(0, li.reserved - COALESCE(
                 (SELECT SUM(lt.quantity) FROM ledger_transactions lt
                  WHERE lt.ledger_item_id = li.id AND lt.device_id = ANY($1)
                  AND lt.action = 'reserve'), 0))
               WHERE li.site_id = $2 AND li.org_id = $3`,
              [deviceIds, siteId, orgId]
            );

            // Log promotion events
            for (const d of verify.rows) {
              await c.query(
                `INSERT INTO device_events (org_id, site_id, device_id, event_type, from_state, to_state, created_by)
                 VALUES ($1, $2, $3, 'draft_promoted', 'draft', 'active', $4)`,
                [orgId, siteId, d.id, req.user.id]
              );
            }

            await c.query('COMMIT');

            // Return promoted devices
            const promoted = await c.query(
              `SELECT * FROM device_instances WHERE id = ANY($1)`,
              [deviceIds]
            );
            return { devices: promoted.rows.map(toDevice) };
          } catch (txErr) {
            await c.query('ROLLBACK');
            throw txErr;
          }
        });

        if (result.error) {
          return res.status(result.status).json({ error: result.error });
        }
        res.json(result);
      } catch (err) {
        console.error('[POST /blueprints/promote]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/sites/:siteId/blueprints/resource-check
  // Shadow resource reservation — Total = Active + Staged
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/resource-check', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;

    try {
      const result = await withOrg(db, orgId, async (c) => {
        // Count active vs staged devices per rack
        const rackUsage = await c.query(
          `SELECT r.id AS rack_id, r.name AS rack_name, r.u_height AS rack_u,
                  COALESCE(SUM(CASE WHEN di.is_draft = false THEN di.u_height ELSE 0 END), 0) AS active_u,
                  COALESCE(SUM(CASE WHEN di.is_draft = true  THEN di.u_height ELSE 0 END), 0) AS staged_u
           FROM racks r
           LEFT JOIN device_instances di ON di.rack_id = r.id AND di.rack_u IS NOT NULL
           WHERE r.site_id = $1 AND r.org_id = $2
           GROUP BY r.id, r.name, r.u_height`,
          [siteId, orgId]
        );

        // Power projection: active + staged
        const powerRes = await c.query(
          `SELECT
             COALESCE(SUM(CASE WHEN di.is_draft = false THEN dt.wattage_max ELSE 0 END), 0) AS active_watts,
             COALESCE(SUM(CASE WHEN di.is_draft = true  THEN dt.wattage_max ELSE 0 END), 0) AS staged_watts
           FROM device_instances di
           JOIN device_templates dt ON dt.id = di.template_id
           WHERE di.site_id = $1 AND di.org_id = $2`,
          [siteId, orgId]
        );

        return {
          racks: rackUsage.rows.map(r => ({
            rackId:   r.rack_id,
            rackName: r.rack_name,
            totalU:   parseInt(r.rack_u, 10),
            activeU:  parseInt(r.active_u, 10),
            stagedU:  parseInt(r.staged_u, 10),
            totalUsedU: parseInt(r.active_u, 10) + parseInt(r.staged_u, 10),
          })),
          power: {
            activeWatts: parseInt(powerRes.rows[0]?.active_watts || '0', 10),
            stagedWatts: parseInt(powerRes.rows[0]?.staged_watts || '0', 10),
            totalWatts:  parseInt(powerRes.rows[0]?.active_watts || '0', 10) +
                         parseInt(powerRes.rows[0]?.staged_watts || '0', 10),
          },
        };
      });

      res.json(result);
    } catch (err) {
      console.error('[GET /blueprints/resource-check]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/sites/:siteId/blueprints/assembly-manual
  // Build Wizard: BOM + wiring guide for all draft devices
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/assembly-manual', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;

    try {
      const result = await withOrg(db, orgId, async (c) => {
        // Draft devices with template + rack info
        const draftsRes = await c.query(
          `SELECT di.id, di.name, di.rack_u, di.u_height, di.serial, di.asset_tag, di.notes,
                  dt.make, dt.model, dt.wattage_max,
                  r.name AS rack_name,
                  z.name AS zone_name
           FROM device_instances di
           LEFT JOIN device_templates dt ON dt.id = di.template_id
           LEFT JOIN racks r             ON r.id   = di.rack_id
           LEFT JOIN zones z             ON z.id   = di.zone_id
           WHERE di.site_id = $1 AND di.org_id = $2 AND di.is_draft = true
           ORDER BY r.name NULLS LAST, di.rack_u NULLS LAST, di.name`,
          [siteId, orgId]
        );

        // Connections involving at least one draft device
        const wiringRes = await c.query(
          `SELECT c.id, c.label, c.src_port, c.dst_port, c.src_block_type, c.dst_block_type,
                  ct.name AS cable_type_name,
                  da.name AS src_device, db.name AS dst_device,
                  ra.name AS src_rack,   rb.name AS dst_rack,
                  da.rack_u AS src_rack_u, db.rack_u AS dst_rack_u
           FROM connections c
           JOIN device_instances da ON da.id = c.src_device_id
           JOIN device_instances db ON db.id = c.dst_device_id
           LEFT JOIN cable_types ct ON ct.id::text = c.cable_type_id
           LEFT JOIN racks ra ON ra.id = da.rack_id
           LEFT JOIN racks rb ON rb.id = db.rack_id
           WHERE c.site_id = $1 AND c.org_id = $2
             AND (da.is_draft = true OR db.is_draft = true)
           ORDER BY ra.name NULLS LAST, da.name, c.src_port NULLS LAST`,
          [siteId, orgId]
        );

        // Build BOM
        const bomMap = new Map();
        let totalWatts = 0;
        let totalU = 0;

        for (const d of draftsRes.rows) {
          const key = d.template_id || `no-template:${d.name}`;
          if (!bomMap.has(key)) {
            bomMap.set(key, {
              make:        d.make || '—',
              model:       d.model || '—',
              count:       0,
              wattageEach: d.wattage_max || 0,
              instances:   [],
            });
          }
          const entry = bomMap.get(key);
          entry.count += 1;
          entry.instances.push({
            name:       d.name,
            rackName:   d.rack_name || null,
            zoneName:   d.zone_name || null,
            rackU:      d.rack_u || null,
            uHeight:    d.u_height || null,
            serial:     d.serial || null,
            assetTag:   d.asset_tag || null,
          });
          totalWatts += (d.wattage_max || 0);
          totalU += (d.u_height || 0);
        }

        return {
          generatedAt:  new Date().toISOString(),
          totalDrafts:  draftsRes.rows.length,
          totalWatts,
          totalU,
          bom:          Array.from(bomMap.values()),
          wiringGuide:  wiringRes.rows.map(r => ({
            connectionId:  r.id,
            label:         r.label || null,
            cableType:     r.cable_type_name || null,
            srcDevice:     r.src_device,
            srcRack:       r.src_rack || null,
            srcRackU:      r.src_rack_u || null,
            srcPort:       r.src_port || null,
            srcBlockType:  r.src_block_type || null,
            dstDevice:     r.dst_device,
            dstRack:       r.dst_rack || null,
            dstRackU:      r.dst_rack_u || null,
            dstPort:       r.dst_port || null,
            dstBlockType:  r.dst_block_type || null,
          })),
        };
      });

      res.json(result);
    } catch (err) {
      console.error('[GET /blueprints/assembly-manual]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};

// ── Device row mapper (shared with racks.js pattern) ──────────────────────────
function toDevice(row) {
  return {
    id:            row.id,
    orgId:         row.org_id,
    siteId:        row.site_id,
    zoneId:        row.zone_id,
    rackId:        row.rack_id,
    templateId:    row.template_id,
    typeId:        row.type_id,
    name:          row.name,
    rackU:         row.rack_u,
    uHeight:       row.u_height,
    face:          row.face,
    ip:            row.ip,
    serial:        row.serial,
    assetTag:      row.asset_tag,
    notes:         row.notes,
    isDraft:       row.is_draft,
    currentStatus: row.current_status ?? undefined,
    createdAt:     row.created_at,
  };
}
