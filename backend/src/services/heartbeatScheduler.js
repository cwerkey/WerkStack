'use strict';

const { execFile } = require('child_process');
const net = require('net');
const os  = require('os');

// ── ICMP ping via system command ────────────────────────────────────────────

function icmpPing(ip, timeoutMs) {
  return new Promise((resolve) => {
    const isWin = os.platform() === 'win32';
    const args = isWin
      ? ['-n', '1', '-w', String(timeoutMs), ip]
      : ['-c', '1', '-W', String(Math.ceil(timeoutMs / 1000)), ip];

    const start = Date.now();
    execFile('ping', args, { timeout: timeoutMs + 2000 }, (err, stdout) => {
      const latency = Date.now() - start;
      if (err) return resolve({ up: false, latency });

      // Parse latency from ping output if available
      const match = stdout.match(/time[=<]\s*([\d.]+)\s*ms/i);
      const parsed = match ? parseFloat(match[1]) : latency;
      resolve({ up: true, latency: Math.round(parsed) });
    });
  });
}

// ── TCP connect fallback ────────────────────────────────────────────────────

function tcpPing(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;

    const finish = (up) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ up, latency: Date.now() - start });
    };

    sock.setTimeout(timeoutMs);
    sock.on('connect', () => finish(true));
    sock.on('timeout', () => finish(false));
    sock.on('error',   () => finish(false));
    sock.connect(port, ip);
  });
}

// ── Ping a single device ────────────────────────────────────────────────────

async function pingDevice(ip, timeoutMs) {
  // Try ICMP first, fall back to TCP 443 then TCP 80
  const icmp = await icmpPing(ip, timeoutMs);
  if (icmp.up) return { up: true, latency: icmp.latency };

  const tcp443 = await tcpPing(ip, 443, timeoutMs);
  if (tcp443.up) return { up: true, latency: tcp443.latency };

  const tcp80 = await tcpPing(ip, 80, timeoutMs);
  return tcp80;
}

// ── Scheduler ───────────────────────────────────────────────────────────────

function startHeartbeatScheduler(db, cron) {
  console.log('[worker:ping] starting heartbeat ping scheduler');

  // Run every 15 seconds, check which devices are due for a ping
  cron.schedule('*/15 * * * * *', async () => {
    try {
      // Fetch all monitor-enabled devices with their site config
      const res = await db.query(
        `SELECT di.id, di.org_id, di.site_id, di.name,
                di.monitor_ip, di.ip, di.monitor_interval_s,
                di.current_status,
                COALESCE(s.monitor_config, '{}')::jsonb AS monitor_config,
                h.received_at AS last_heartbeat
         FROM device_instances di
         JOIN sites s ON s.id = di.site_id
         LEFT JOIN LATERAL (
           SELECT received_at FROM heartbeats
           WHERE device_id = di.id
           ORDER BY received_at DESC LIMIT 1
         ) h ON true
         WHERE di.monitor_enabled = true
           AND di.is_draft = false
           AND (di.monitor_ip IS NOT NULL OR di.ip IS NOT NULL)`
      );

      const now = Date.now();

      for (const device of res.rows) {
        const siteConfig = device.monitor_config || {};
        const intervalS = device.monitor_interval_s || siteConfig.intervalS || 60;
        const timeoutMs = siteConfig.timeoutMs || 5000;
        const missedThreshold = siteConfig.missedThreshold || 2;

        // Check if this device is due for a ping
        if (device.last_heartbeat) {
          const elapsed = now - new Date(device.last_heartbeat).getTime();
          if (elapsed < intervalS * 1000) continue; // not due yet
        }

        const ip = device.monitor_ip || device.ip;
        const result = await pingDevice(ip, timeoutMs);
        const status = result.up ? 'up' : 'down';
        const prevStatus = device.current_status || 'unknown';

        const client = await db.connect();
        try {
          await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [device.org_id]);

          // Insert heartbeat
          await client.query(
            `INSERT INTO heartbeats (org_id, site_id, device_id, status, latency_ms)
             VALUES ($1,$2,$3,$4,$5)`,
            [device.org_id, device.site_id, device.id, status, result.latency]
          );

          // Update current_status
          if (prevStatus !== status) {
            await client.query(
              `UPDATE device_instances SET current_status = $1 WHERE id = $2`,
              [status, device.id]
            );

            // Determine event type
            let eventType = 'status_change';
            if (status === 'down' && (prevStatus === 'up' || prevStatus === 'degraded')) {
              eventType = 'heartbeat_missed';
            } else if (status === 'up' && (prevStatus === 'down' || prevStatus === 'unknown')) {
              eventType = 'heartbeat_restored';
            }

            await client.query(
              `INSERT INTO device_events
                 (org_id, site_id, device_id, event_type, from_state, to_state, details)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [device.org_id, device.site_id, device.id, eventType, prevStatus, status,
               JSON.stringify({ ip, latencyMs: result.latency, method: 'ping' })]
            );

            const label = status === 'up' ? '✓ UP' : '✗ DOWN';
            console.log(`[worker:ping] ${device.name} (${ip}) → ${label} (was ${prevStatus})`);
          }
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error('[worker:ping] error:', err.message);
    }
  });
}

module.exports = { startHeartbeatScheduler, pingDevice };
