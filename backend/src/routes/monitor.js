'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const HeartbeatSchema = z.object({
  deviceId:  z.string().uuid(),
  status:    z.enum(['up', 'down', 'degraded', 'unknown']).default('up'),
  latencyMs: z.number().int().min(0).optional(),
  payload:   z.record(z.unknown()).optional(),
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

function toHeartbeat(row) {
  return {
    id:         row.id,
    orgId:      row.org_id,
    siteId:     row.site_id,
    deviceId:   row.device_id,
    status:     row.status,
    latencyMs:  row.latency_ms ?? undefined,
    payload:    row.payload    ?? undefined,
    receivedAt: row.received_at,
  };
}

function toEvent(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    deviceId:  row.device_id,
    eventType: row.event_type,
    fromState: row.from_state ?? undefined,
    toState:   row.to_state   ?? undefined,
    details:   row.details    ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

module.exports = function monitorRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  router.post(
    '/heartbeat',
    validate(HeartbeatSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      const { deviceId, status, latencyMs, payload } = req.body;

      try {
        const result = await withOrg(db, orgId, async (c) => {
          const devRes = await c.query(
            `SELECT id, current_status FROM device_instances
             WHERE id=$1 AND site_id=$2 AND org_id=$3`,
            [deviceId, siteId, orgId]
          );
          if (devRes.rows.length === 0) {
            return { error: 'device not found', status: 404 };
          }

          const prevStatus = devRes.rows[0].current_status || 'unknown';

          const hbRes = await c.query(
            `INSERT INTO heartbeats (org_id, site_id, device_id, status, latency_ms, payload)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [orgId, siteId, deviceId, status, latencyMs ?? null,
             payload ? JSON.stringify(payload) : null]
          );

          if (prevStatus !== status) {
            await c.query(
              `UPDATE device_instances SET current_status = $1
               WHERE id = $2 AND site_id = $3 AND org_id = $4`,
              [status, deviceId, siteId, orgId]
            );

            await c.query(
              `INSERT INTO device_events
                 (org_id, site_id, device_id, event_type, from_state, to_state)
               VALUES ($1,$2,$3,'status_change',$4,$5)`,
              [orgId, siteId, deviceId, prevStatus, status]
            );
          }

          return { heartbeat: toHeartbeat(hbRes.rows[0]) };
        });

        if (result.error) {
          return res.status(result.status).json({ error: result.error });
        }
        res.status(201).json(result.heartbeat);
      } catch (err) {
        console.error('[POST /monitor/heartbeat]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get('/status', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;

    try {
      const result = await withOrg(db, orgId, async (c) => {
        const devicesRes = await c.query(
          `SELECT di.id, di.name, di.type_id, di.current_status,
                  h.received_at AS last_heartbeat, h.latency_ms AS last_latency
           FROM device_instances di
           LEFT JOIN LATERAL (
             SELECT received_at, latency_ms FROM heartbeats
             WHERE device_id = di.id
             ORDER BY received_at DESC LIMIT 1
           ) h ON true
           WHERE di.site_id = $1 AND di.org_id = $2 AND di.is_draft = false
           ORDER BY di.name`,
          [siteId, orgId]
        );

        return devicesRes.rows.map(r => ({
          deviceId:      r.id,
          deviceName:    r.name,
          typeId:        r.type_id,
          currentStatus: r.current_status || 'unknown',
          lastHeartbeat: r.last_heartbeat ?? undefined,
          lastLatency:   r.last_latency   ?? undefined,
        }));
      });

      res.json(result);
    } catch (err) {
      console.error('[GET /monitor/status]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.get('/heartbeats/:deviceId', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId, deviceId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM heartbeats
           WHERE device_id = $1 AND site_id = $2 AND org_id = $3
           ORDER BY received_at DESC LIMIT 100`,
          [deviceId, siteId, orgId]
        )
      );
      res.json(result.rows.map(toHeartbeat));
    } catch (err) {
      console.error('[GET /monitor/heartbeats/:deviceId]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.get('/events', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    const { deviceId } = req.query;

    try {
      let query = `SELECT * FROM device_events WHERE site_id = $1 AND org_id = $2`;
      const params = [siteId, orgId];
      if (deviceId) {
        query += ` AND device_id = $3`;
        params.push(deviceId);
      }
      query += ` ORDER BY created_at DESC LIMIT 200`;

      const result = await withOrg(db, orgId, c => c.query(query, params));
      res.json(result.rows.map(toEvent));
    } catch (err) {
      console.error('[GET /monitor/events]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
