'use strict';

const HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_CHECK_CRON   = '* * * * *';    // every minute

function startHeartbeatChecker(db, cron) {
  console.log('[worker:heartbeat] starting heartbeat checker');

  cron.schedule(HEARTBEAT_CHECK_CRON, async () => {
    try {
      const cutoff = new Date(Date.now() - HEARTBEAT_THRESHOLD_MS).toISOString();

      const staleRes = await db.query(
        `SELECT di.id, di.org_id, di.site_id, di.current_status, di.name, di.maintenance_mode,
                h.received_at AS last_heartbeat
         FROM device_instances di
         LEFT JOIN LATERAL (
           SELECT received_at FROM heartbeats
           WHERE device_id = di.id
           ORDER BY received_at DESC LIMIT 1
         ) h ON true
         WHERE di.is_draft = false
           AND di.current_status IN ('up', 'degraded')
           AND (h.received_at IS NULL OR h.received_at < $1)`,
        [cutoff]
      );

      for (const device of staleRes.rows) {
        const client = await db.connect();
        try {
          await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [device.org_id]);

          await client.query(
            `UPDATE device_instances SET current_status = 'down' WHERE id = $1`,
            [device.id]
          );

          // Skip event creation when device is in maintenance mode
          if (!device.maintenance_mode) {
            await client.query(
              `INSERT INTO device_events
                 (org_id, site_id, device_id, event_type, from_state, to_state,
                  details)
               VALUES ($1,$2,$3,'heartbeat_missed',$4,'down',$5)`,
              [device.org_id, device.site_id, device.id, device.current_status,
               JSON.stringify({
                 lastHeartbeat: device.last_heartbeat,
                 threshold: `${HEARTBEAT_THRESHOLD_MS / 1000}s`,
               })]
            );
          }

          const maintenanceNote = device.maintenance_mode ? ' [maintenance]' : '';
          console.log(`[worker:heartbeat] marked device ${device.name} (${device.id}) as down${maintenanceNote}`);
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error('[worker:heartbeat] error:', err.message);
    }
  });
}

const DRAFT_MAX_AGE_DAYS    = 30;
const DRAFT_CLEANUP_CRON    = '0 * * * *'; // every hour

function startDraftCleanup(db, cron) {
  console.log('[worker:drafts] starting abandoned draft cleanup');

  cron.schedule(DRAFT_CLEANUP_CRON, async () => {
    try {
      const cutoff = new Date(Date.now() - DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const abandonedRes = await db.query(
        `SELECT di.id, di.org_id, di.site_id, di.name
         FROM device_instances di
         WHERE di.is_draft = true
           AND di.created_at < $1
           AND NOT EXISTS (
             SELECT 1 FROM device_events de
             WHERE de.device_id = di.id
               AND de.created_at > $1
           )`,
        [cutoff]
      );

      for (const device of abandonedRes.rows) {
        const client = await db.connect();
        try {
          await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [device.org_id]);

          await client.query(
            `INSERT INTO device_events
               (org_id, site_id, device_id, event_type, from_state, to_state,
                details)
             VALUES ($1,$2,$3,'draft_abandoned','draft','deleted',$4)`,
            [device.org_id, device.site_id, device.id,
             JSON.stringify({ reason: `draft older than ${DRAFT_MAX_AGE_DAYS} days with no activity` })]
          );

          await client.query(
            `DELETE FROM device_instances WHERE id = $1`,
            [device.id]
          );

          console.log(`[worker:drafts] cleaned up abandoned draft: ${device.name} (${device.id})`);
        } finally {
          client.release();
        }
      }

      if (abandonedRes.rows.length > 0) {
        console.log(`[worker:drafts] cleaned ${abandonedRes.rows.length} abandoned drafts`);
      }
    } catch (err) {
      console.error('[worker:drafts] error:', err.message);
    }
  });
}

const GIT_SYNC_CHECK_CRON = '* * * * *'; // every minute

function startGitSyncScheduler(db, cron) {
  console.log('[worker:git-sync] starting git-sync scheduler');

  const { fetchGuides, hasChanges, pushGuides } = require('./lib/git_sync_push');

  cron.schedule(GIT_SYNC_CHECK_CRON, async () => {
    try {
      // Only pick up configs that are enabled and whose interval has elapsed
      const dueRes = await db.query(
        `SELECT * FROM git_sync_config
         WHERE enabled = true
           AND repo_url IS NOT NULL
           AND (last_sync_at IS NULL
                OR last_sync_at + (push_interval || ' seconds')::interval < now())`
      );

      for (const config of dueRes.rows) {
        try {
          // Skip if no guide content has changed since the last sync
          const changed = await hasChanges(db, config.org_id, config.site_id, config.last_sync_at);
          if (!changed) {
            console.log(`[worker:git-sync] no changes for site ${config.site_id}, skipping`);
            // Bump last_sync_at so we don't re-check every minute forever
            const c = await db.connect();
            try {
              await c.query(`SELECT set_config('app.current_org_id', $1, true)`, [config.org_id]);
              await c.query(
                `UPDATE git_sync_config SET last_sync_at=now(), last_sync_status='success', updated_at=now() WHERE id=$1`,
                [config.id]
              );
            } finally { c.release(); }
            continue;
          }

          const { guides, manuals } = await fetchGuides(db, config.org_id, config.site_id);
          const { pushed } = await pushGuides(config, guides, manuals);

          const c = await db.connect();
          try {
            await c.query(`SELECT set_config('app.current_org_id', $1, true)`, [config.org_id]);
            await c.query(
              `UPDATE git_sync_config
               SET last_sync_at=now(), last_sync_status='success', updated_at=now()
               WHERE id=$1`,
              [config.id]
            );
          } finally { c.release(); }

          if (pushed) {
            console.log(`[worker:git-sync] pushed ${guides.length} guide(s) for site ${config.site_id}`);
          }
        } catch (gitErr) {
          const safe = (gitErr.message || '').replace(/x-access-token:[^@]+@/, 'x-access-token:***@');
          const c = await db.connect();
          try {
            await c.query(`SELECT set_config('app.current_org_id', $1, true)`, [config.org_id]);
            await c.query(
              `UPDATE git_sync_config
               SET last_sync_at=now(), last_sync_status='error', updated_at=now()
               WHERE id=$1`,
              [config.id]
            );
          } finally { c.release(); }
          console.error(`[worker:git-sync] push failed for site ${config.site_id}:`, safe);
        }
      }
    } catch (err) {
      console.error('[worker:git-sync] error:', err.message);
    }
  });
}

module.exports = function startWorkers(db) {
  let cron;
  try {
    cron = require('node-cron');
  } catch {
    console.warn('[workers] node-cron not installed — background workers disabled');
    return;
  }

  startHeartbeatChecker(db, cron);
  startDraftCleanup(db, cron);
  startGitSyncScheduler(db, cron);

  const { startHeartbeatScheduler } = require('./services/heartbeatScheduler');
  startHeartbeatScheduler(db, cron);

  console.log('[workers] all background workers started');
};
