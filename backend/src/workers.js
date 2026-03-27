'use strict';

/**
 * Background workers for Phase 11:
 * 1. Heartbeat checker — marks devices as down if no heartbeat received within threshold
 * 2. Abandoned draft cleanup — removes drafts older than configurable age
 * 3. Git-sync scheduler — pushes site data on configured intervals
 */

// ── Heartbeat Checker ─────────────────────────────────────────────────────────
// Runs every 60 seconds. If a non-draft device hasn't sent a heartbeat within
// the threshold (5 min default), mark it as 'down' and log the event.

const HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_CHECK_CRON   = '* * * * *';    // every minute

function startHeartbeatChecker(db, cron) {
  console.log('[worker:heartbeat] starting heartbeat checker');

  cron.schedule(HEARTBEAT_CHECK_CRON, async () => {
    try {
      const cutoff = new Date(Date.now() - HEARTBEAT_THRESHOLD_MS).toISOString();

      // Find devices that are currently 'up' or 'degraded' but have no recent heartbeat
      const staleRes = await db.query(
        `SELECT di.id, di.org_id, di.site_id, di.current_status, di.name,
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

          // Update device status to 'down'
          await client.query(
            `UPDATE device_instances SET current_status = 'down' WHERE id = $1`,
            [device.id]
          );

          // Log heartbeat_missed event
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

          console.log(`[worker:heartbeat] marked device ${device.name} (${device.id}) as down`);
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error('[worker:heartbeat] error:', err.message);
    }
  });
}

// ── Abandoned Draft Cleanup ──────────────────────────────────────────────────
// Runs every hour. Removes draft devices older than 30 days with no activity.

const DRAFT_MAX_AGE_DAYS    = 30;
const DRAFT_CLEANUP_CRON    = '0 * * * *'; // every hour

function startDraftCleanup(db, cron) {
  console.log('[worker:drafts] starting abandoned draft cleanup');

  cron.schedule(DRAFT_CLEANUP_CRON, async () => {
    try {
      const cutoff = new Date(Date.now() - DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Find abandoned drafts (no events in the last 30 days)
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

          // Log abandonment event before deletion
          await client.query(
            `INSERT INTO device_events
               (org_id, site_id, device_id, event_type, from_state, to_state,
                details)
             VALUES ($1,$2,$3,'draft_abandoned','draft','deleted',$4)`,
            [device.org_id, device.site_id, device.id,
             JSON.stringify({ reason: `draft older than ${DRAFT_MAX_AGE_DAYS} days with no activity` })]
          );

          // Delete the draft
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

// ── Git-Sync Scheduler ──────────────────────────────────────────────────────
// Runs every minute. Checks if any git-sync configs are due for a push.

const GIT_SYNC_CHECK_CRON = '* * * * *'; // every minute

function startGitSyncScheduler(db, cron) {
  console.log('[worker:git-sync] starting git-sync scheduler');

  cron.schedule(GIT_SYNC_CHECK_CRON, async () => {
    try {
      // Find configs due for push
      const dueRes = await db.query(
        `SELECT * FROM git_sync_config
         WHERE enabled = true
           AND (last_push_at IS NULL
                OR last_push_at + (push_interval || ' seconds')::interval < now())`
      );

      for (const config of dueRes.rows) {
        try {
          const simpleGit = require('simple-git');
          const path = require('path');
          const fs   = require('fs');

          // Export site data
          const client = await db.connect();
          let data;
          try {
            await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [config.org_id]);

            const [sitesRes, racksRes, devicesRes, connsRes, subnetsRes, ipsRes, poolsRes, drivesRes, sharesRes] = await Promise.all([
              client.query(`SELECT * FROM sites WHERE id=$1 AND org_id=$2`, [config.site_id, config.org_id]),
              client.query(`SELECT * FROM racks WHERE site_id=$1 AND org_id=$2`, [config.site_id, config.org_id]),
              client.query(`SELECT * FROM device_instances WHERE site_id=$1 AND org_id=$2`, [config.site_id, config.org_id]),
              client.query(`SELECT * FROM connections WHERE site_id=$1 AND org_id=$2`, [config.site_id, config.org_id]),
              client.query(`SELECT * FROM subnets WHERE site_id=$1 AND org_id=$2`, [config.site_id, config.org_id]),
              client.query(`SELECT * FROM ip_assignments WHERE site_id=$1 AND org_id=$2`, [config.site_id, config.org_id]),
              client.query(`SELECT * FROM storage_pools WHERE site_id=$1 AND org_id=$2`, [config.site_id, config.org_id]),
              client.query(`SELECT * FROM drives WHERE site_id=$1 AND org_id=$2`, [config.site_id, config.org_id]),
              client.query(`SELECT * FROM shares WHERE site_id=$1 AND org_id=$2`, [config.site_id, config.org_id]),
            ]);

            data = {
              exportedAt:  new Date().toISOString(),
              site:        sitesRes.rows[0] || null,
              racks:       racksRes.rows,
              devices:     devicesRes.rows,
              connections: connsRes.rows,
              subnets:     subnetsRes.rows,
              ips:         ipsRes.rows,
              pools:       poolsRes.rows,
              drives:      drivesRes.rows,
              shares:      sharesRes.rows,
            };
          } finally {
            client.release();
          }

          // Git operations
          const repoDir = path.join('/tmp', 'werkstack-sync', config.site_id);
          fs.mkdirSync(repoDir, { recursive: true });

          const git = simpleGit(repoDir);
          const isRepo = fs.existsSync(path.join(repoDir, '.git'));

          if (!isRepo) {
            await git.clone(config.repo_url, repoDir, ['--branch', config.branch]);
          } else {
            await git.pull('origin', config.branch);
          }

          const filePath = path.join(repoDir, 'site-data.json');
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

          await git.add('.');
          const status = await git.status();
          if (status.files.length > 0) {
            await git.commit(`WerkStack auto-sync: ${new Date().toISOString()}`);
            await git.push('origin', config.branch);
          }

          // Update last push (use client with RLS scope)
          const updateClient = await db.connect();
          try {
            await updateClient.query(`SELECT set_config('app.current_org_id', $1, true)`, [config.org_id]);
            await updateClient.query(
              `UPDATE git_sync_config
               SET last_push_at = now(), last_push_error = NULL, updated_at = now()
               WHERE id = $1`,
              [config.id]
            );
          } finally {
            updateClient.release();
          }

          console.log(`[worker:git-sync] pushed site ${config.site_id}`);
        } catch (gitErr) {
          // Record error but don't crash worker (use client with RLS scope)
          const errClient = await db.connect();
          try {
            await errClient.query(`SELECT set_config('app.current_org_id', $1, true)`, [config.org_id]);
            await errClient.query(
              `UPDATE git_sync_config
               SET last_push_error = $1, updated_at = now()
               WHERE id = $2`,
              [gitErr.message, config.id]
            );
          } finally {
            errClient.release();
          }
          console.error(`[worker:git-sync] push failed for site ${config.site_id}:`, gitErr.message);
        }
      }
    } catch (err) {
      console.error('[worker:git-sync] error:', err.message);
    }
  });
}

// ── Exports ──────────────────────────────────────────────────────────────────

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

  console.log('[workers] all background workers started');
};
