'use strict';

const express = require('express');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');

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

function toEntry(row) {
  return {
    id:         row.id,
    orgId:      row.org_id,
    siteId:     row.site_id    ?? undefined,
    actorId:    row.actor_id   ?? undefined,
    actorEmail: row.actor_email ?? undefined,
    action:     row.action,
    resource:   row.resource   ?? undefined,
    resourceId: row.resource_id ?? undefined,
    details:    row.details    ?? undefined,
    ipAddress:  row.ip_address ?? undefined,
    createdAt:  row.created_at,
  };
}

// ── Public helper — write an audit entry ──────────────────────────────────────
// Called from other routes: await writeAudit(db, { orgId, siteId, actorId, actorEmail, action, resource, resourceId, details, ipAddress })

async function writeAudit(db, { orgId, siteId, actorId, actorEmail, action, resource, resourceId, details, ipAddress }) {
  try {
    const client = await db.connect();
    try {
      await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
      await client.query(
        `INSERT INTO audit_log (org_id, site_id, actor_id, actor_email, action, resource, resource_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [orgId, siteId ?? null, actorId ?? null, actorEmail ?? null, action,
         resource ?? null, resourceId ? String(resourceId) : null,
         details ? JSON.stringify(details) : null, ipAddress ?? null]
      );
    } finally {
      client.release();
    }
  } catch (err) {
    // Never let audit failures break the main operation
    console.error('[audit_log] write failed:', err.message);
  }
}

// ── Route factory ─────────────────────────────────────────────────────────────

module.exports = function auditLogRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/sites/:siteId/audit-log?limit=50&offset=0&resource=device
  // Paginated audit log; admin+ only
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/', requireRole('admin'), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    const limit      = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset     = parseInt(req.query.offset || '0', 10);
    const resource   = req.query.resource || null;

    try {
      const result = await withOrg(db, orgId, async (c) => {
        const params = [siteId, orgId, limit, offset];
        let where = 'WHERE a.site_id = $1 AND a.org_id = $2';
        if (resource) {
          where += ` AND a.resource = $5`;
          params.push(resource);
        }

        const rows = await c.query(
          `SELECT a.*, u.email AS actor_email_join
           FROM audit_log a
           LEFT JOIN users u ON u.id = a.actor_id
           ${where}
           ORDER BY a.created_at DESC
           LIMIT $3 OFFSET $4`,
          params
        );

        const countRes = await c.query(
          `SELECT COUNT(*)::integer AS total FROM audit_log a ${where}`,
          params.slice(0, resource ? 5 : 4).filter((_, i) => i !== 2 && i !== 3)
            .concat(resource ? [] : [])
          // rebuild clean param list for count
        );

        // simpler count query
        const totalRes = await c.query(
          resource
            ? `SELECT COUNT(*)::integer AS total FROM audit_log WHERE site_id = $1 AND org_id = $2 AND resource = $3`
            : `SELECT COUNT(*)::integer AS total FROM audit_log WHERE site_id = $1 AND org_id = $2`,
          resource ? [siteId, orgId, resource] : [siteId, orgId]
        );

        return {
          entries: rows.rows.map(r => ({
            ...toEntry(r),
            actorEmail: r.actor_email || r.actor_email_join || undefined,
          })),
          total:  totalRes.rows[0]?.total ?? 0,
          limit,
          offset,
        };
      });

      res.json(result);
    } catch (err) {
      console.error('[GET /audit-log]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};

module.exports.writeAudit = writeAudit;
