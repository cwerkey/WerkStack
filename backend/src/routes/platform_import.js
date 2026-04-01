'use strict';

const express = require('express');
const https   = require('https');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ─── Self-signed cert agent (common in homelabs) ────────────────────────────

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const TrueNASConnectSchema = z.object({
  apiUrl:   z.string().min(1).max(1000),
  apiKey:   z.string().min(1).max(2000),
  deviceId: z.string().uuid(),
});

const TrueNASCommitSchema = z.object({
  deviceId: z.string().uuid(),
  pools:    z.array(z.object({
    name:     z.string(),
    topology: z.any().optional(),
    status:   z.string().optional(),
  })).default([]),
  shares:   z.array(z.object({
    name:     z.string(),
    protocol: z.enum(['smb', 'nfs']),
    path:     z.string().optional(),
  })).default([]),
  apps:     z.array(z.object({
    name:  z.string(),
    state: z.string().optional(),
  })).default([]),
});

const ProxmoxConnectSchema = z.object({
  apiUrl:   z.string().min(1).max(1000),
  apiToken: z.string().min(1).max(2000),
  tokenId:  z.string().min(1).max(500),
  deviceId: z.string().uuid(),
});

const ProxmoxCommitSchema = z.object({
  deviceId:   z.string().uuid(),
  vms:        z.array(z.object({
    vmid:    z.number().optional(),
    name:    z.string(),
    status:  z.string().optional(),
    cores:   z.number().optional(),
    memory:  z.number().optional(),
    maxdisk: z.number().optional(),
  })).default([]),
  containers: z.array(z.object({
    vmid:   z.number().optional(),
    name:   z.string(),
    status: z.string().optional(),
    cores:  z.number().optional(),
    memory: z.number().optional(),
  })).default([]),
  pools:      z.array(z.object({
    storage: z.string(),
    type:    z.string().optional(),
    total:   z.number().optional(),
    used:    z.number().optional(),
  })).default([]),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function withOrg(db, orgId, fn) {
  const client = await db.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Fetch JSON from an external API, handling self-signed certs. */
async function externalFetch(url, headers) {
  const isHttps = url.startsWith('https');
  const options = {
    method: 'GET',
    headers,
  };
  return new Promise((resolve, reject) => {
    if (isHttps) {
      const parsedUrl = new URL(url);
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port:     parsedUrl.port || 443,
        path:     parsedUrl.pathname + parsedUrl.search,
        method:   'GET',
        headers,
        agent:    insecureAgent,
      };
      const req = https.request(reqOptions, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            reject(new Error(`invalid JSON response from ${url}`));
          }
        });
      });
      req.on('error', err => reject(err));
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('request timed out')); });
      req.end();
    } else {
      // HTTP — use global fetch
      const http = require('http');
      const parsedUrl = new URL(url);
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port:     parsedUrl.port || 80,
        path:     parsedUrl.pathname + parsedUrl.search,
        method:   'GET',
        headers,
      };
      const req = http.request(reqOptions, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            reject(new Error(`invalid JSON response from ${url}`));
          }
        });
      });
      req.on('error', err => reject(err));
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('request timed out')); });
      req.end();
    }
  });
}

/**
 * Upsert an os_host record for the given device, returning the host id.
 */
async function ensureOsHost(client, orgId, siteId, deviceId, hostOs) {
  const result = await client.query(
    `INSERT INTO os_hosts (org_id, site_id, device_id, host_os)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (org_id, device_id)
     DO UPDATE SET host_os = COALESCE(NULLIF(os_hosts.host_os, ''), $4)
     RETURNING id`,
    [orgId, siteId, deviceId, hostOs]
  );
  return result.rows[0].id;
}

/**
 * Map Proxmox storage type to WerkStack poolType enum.
 */
function mapProxmoxPoolType(pveType) {
  if (!pveType) return 'lvm';
  const t = pveType.toLowerCase();
  if (t === 'zfspool' || t === 'zfs')   return 'zfs';
  if (t === 'lvm' || t === 'lvmthin')   return 'lvm';
  if (t === 'ceph' || t === 'cephfs' || t === 'rbd') return 'ceph';
  if (t === 'dir' || t === 'nfs' || t === 'cifs' || t === 'glusterfs') return 'drive';
  return 'lvm';
}

// ─── Routes ──────────────────────────────────────────────────────────────────

module.exports = function platformImportRoutes(db) {
  const router = express.Router({ mergeParams: true });

  // ════════════════════════════════════════════════════════════════════════════
  // TrueNAS SCALE
  // ════════════════════════════════════════════════════════════════════════════

  // POST /:siteId/import/platform/truenas/connect
  router.post(
    '/:siteId/import/platform/truenas/connect',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(TrueNASConnectSchema),
    async (req, res) => {
      const { apiUrl, apiKey } = req.body;
      const base = apiUrl.replace(/\/+$/, '');
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      };

      try {
        const [poolRes, smbRes, nfsRes, appRes, ifaceRes] = await Promise.all([
          externalFetch(`${base}/api/v2.0/pool`,          headers),
          externalFetch(`${base}/api/v2.0/sharing/smb`,   headers),
          externalFetch(`${base}/api/v2.0/sharing/nfs`,   headers),
          externalFetch(`${base}/api/v2.0/app`,           headers).catch(() => ({ status: 200, body: [] })),
          externalFetch(`${base}/api/v2.0/interface`,     headers).catch(() => ({ status: 200, body: [] })),
        ]);

        // Validate we got usable responses
        if (poolRes.status >= 400) {
          return res.status(400).json({
            error: `connection failed: TrueNAS returned HTTP ${poolRes.status}`,
          });
        }

        const pools = (Array.isArray(poolRes.body) ? poolRes.body : []).map(p => ({
          name:     p.name,
          topology: p.topology ?? {},
          status:   p.status ?? p.healthy ? 'ONLINE' : 'UNKNOWN',
        }));

        const smbShares = (Array.isArray(smbRes.body) ? smbRes.body : []).map(s => ({
          name:     s.name,
          protocol: 'smb',
          path:     s.path ?? s.path_local ?? '',
          enabled:  s.enabled !== false,
        }));

        const nfsShares = (Array.isArray(nfsRes.body) ? nfsRes.body : []).map(s => ({
          name:     s.comment || s.path || 'nfs-export',
          protocol: 'nfs',
          path:     (s.paths ?? [s.path])[0] ?? '',
          enabled:  s.enabled !== false,
        }));

        const apps = (Array.isArray(appRes.body) ? appRes.body : []).map(a => ({
          name:  a.name ?? a.id ?? 'unknown',
          state: a.state ?? a.status ?? 'unknown',
        }));

        const interfaces = (Array.isArray(ifaceRes.body) ? ifaceRes.body : []).map(i => ({
          name:    i.name,
          aliases: (i.aliases ?? []).map(a => ({
            address: a.address,
            netmask: a.netmask,
          })),
          state: i.state?.link_state ?? i.state ?? 'unknown',
        }));

        res.json({
          pools,
          shares: [...smbShares, ...nfsShares],
          apps,
          interfaces,
        });
      } catch (err) {
        console.error('[truenas/connect]', err);
        res.status(400).json({ error: `connection failed: ${err.message}` });
      }
    }
  );

  // POST /:siteId/import/platform/truenas/commit
  router.post(
    '/:siteId/import/platform/truenas/commit',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(TrueNASCommitSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { deviceId, pools, shares, apps } = req.body;

      try {
        const result = await withOrg(db, orgId, async c => {
          // Ensure os_host exists
          const hostId = await ensureOsHost(c, orgId, siteId, deviceId, 'TrueNAS SCALE');

          let poolCount = 0;
          let shareCount = 0;
          let appCount = 0;

          // Create pools (skip duplicates by name+device)
          for (const pool of pools) {
            const exists = await c.query(
              `SELECT id FROM storage_pools WHERE org_id=$1 AND site_id=$2 AND device_id=$3 AND name=$4`,
              [orgId, siteId, deviceId, pool.name]
            );
            if (exists.rows.length > 0) continue;

            // Build vdevGroups from TrueNAS topology
            const vdevGroups = [];
            if (pool.topology) {
              for (const [groupType, vdevs] of Object.entries(pool.topology)) {
                if (!Array.isArray(vdevs) || vdevs.length === 0) continue;
                for (const vdev of vdevs) {
                  vdevGroups.push({
                    id:       `${pool.name}-${groupType}-${vdevGroups.length}`,
                    type:     vdev.type?.toLowerCase() ?? groupType,
                    driveIds: (vdev.children ?? vdev.devices ?? []).map((d, i) =>
                      typeof d === 'string' ? d : (d.device ?? d.path ?? `disk-${i}`)
                    ),
                    label:    vdev.name ?? `${groupType}-${vdevGroups.length}`,
                  });
                }
              }
            }

            const health = (pool.status ?? '').toLowerCase().includes('online') ? 'online'
              : (pool.status ?? '').toLowerCase().includes('degraded') ? 'degraded'
              : (pool.status ?? '').toLowerCase().includes('faulted') ? 'faulted'
              : 'unknown';

            await c.query(
              `INSERT INTO storage_pools
                 (org_id, site_id, device_id, name, color, pool_type, raid_level, vdev_groups, health, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [orgId, siteId, deviceId, pool.name, '#4a8fc4', 'zfs',
               'stripe', JSON.stringify(vdevGroups), health,
               `Imported from TrueNAS SCALE`]
            );
            poolCount++;
          }

          // Create shares (skip duplicates by name+protocol)
          for (const share of shares) {
            const exists = await c.query(
              `SELECT id FROM shares WHERE org_id=$1 AND site_id=$2 AND name=$3 AND protocol=$4`,
              [orgId, siteId, share.name, share.protocol]
            );
            if (exists.rows.length > 0) continue;

            await c.query(
              `INSERT INTO shares (org_id, site_id, pool_id, name, protocol, path, access_mode, access_list, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [orgId, siteId, null, share.name, share.protocol, share.path ?? null,
               'public', JSON.stringify([]),
               `Imported from TrueNAS SCALE`]
            );
            shareCount++;
          }

          // Create apps as containers (skip duplicates by name+host)
          for (const app of apps) {
            const exists = await c.query(
              `SELECT id FROM containers WHERE org_id=$1 AND site_id=$2 AND host_id=$3 AND name=$4`,
              [orgId, siteId, hostId, app.name]
            );
            if (exists.rows.length > 0) continue;

            const status = (app.state ?? '').toLowerCase() === 'running' ? 'running'
              : (app.state ?? '').toLowerCase() === 'stopped' ? 'stopped'
              : 'unknown';

            await c.query(
              `INSERT INTO containers
                 (org_id, site_id, host_id, vm_id, name, image, tag, status,
                  ports, volumes, networks, compose_file, compose_service,
                  upstream_dependency_id, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
              [orgId, siteId, hostId, null,
               app.name, app.name, 'truenas-app', status,
               JSON.stringify([]), JSON.stringify([]),
               JSON.stringify([]),
               null, null, null,
               `Imported from TrueNAS SCALE`]
            );
            appCount++;
          }

          return { pools: poolCount, shares: shareCount, apps: appCount };
        });

        res.status(201).json({ created: result });
      } catch (err) {
        console.error(`[POST /api/sites/${req.params.siteId}/import/platform/truenas/commit]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Proxmox VE
  // ════════════════════════════════════════════════════════════════════════════

  // POST /:siteId/import/platform/proxmox/connect
  router.post(
    '/:siteId/import/platform/proxmox/connect',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(ProxmoxConnectSchema),
    async (req, res) => {
      const { apiUrl, apiToken, tokenId } = req.body;
      const base = apiUrl.replace(/\/+$/, '');
      const headers = {
        'Authorization': `PVEAPIToken=${tokenId}=${apiToken}`,
        'Content-Type':  'application/json',
      };

      try {
        // Get node list first
        const nodesRes = await externalFetch(`${base}/api2/json/nodes`, headers);

        if (nodesRes.status >= 400) {
          return res.status(400).json({
            error: `connection failed: Proxmox returned HTTP ${nodesRes.status}`,
          });
        }

        const nodes = nodesRes.body?.data ?? [];
        if (nodes.length === 0) {
          return res.status(400).json({ error: 'connection failed: no nodes found' });
        }

        const nodeName = nodes[0].node;

        // Fetch VMs, LXC, storage, network from first node
        const [qemuRes, lxcRes, storageRes, netRes] = await Promise.all([
          externalFetch(`${base}/api2/json/nodes/${nodeName}/qemu`,    headers),
          externalFetch(`${base}/api2/json/nodes/${nodeName}/lxc`,     headers),
          externalFetch(`${base}/api2/json/storage`,                   headers),
          externalFetch(`${base}/api2/json/nodes/${nodeName}/network`, headers).catch(() => ({ status: 200, body: { data: [] } })),
        ]);

        const vms = (qemuRes.body?.data ?? []).map(v => ({
          vmid:    v.vmid,
          name:    v.name ?? `vm-${v.vmid}`,
          status:  v.status ?? 'unknown',
          cores:   v.cpus ?? v.cores ?? undefined,
          memory:  v.maxmem ?? v.mem ?? undefined,
          maxdisk: v.maxdisk ?? undefined,
        }));

        const containers = (lxcRes.body?.data ?? []).map(c => ({
          vmid:   c.vmid,
          name:   c.name ?? `ct-${c.vmid}`,
          status: c.status ?? 'unknown',
          cores:  c.cpus ?? c.cores ?? undefined,
          memory: c.maxmem ?? c.mem ?? undefined,
        }));

        const pools = (storageRes.body?.data ?? []).map(s => ({
          storage: s.storage,
          type:    s.type ?? 'dir',
          total:   s.total ?? undefined,
          used:    s.used ?? undefined,
        }));

        const bridges = (netRes.body?.data ?? []).map(n => ({
          iface:   n.iface,
          type:    n.type ?? 'unknown',
          address: n.address ?? n.cidr ?? undefined,
        }));

        res.json({ vms, containers, pools, bridges });
      } catch (err) {
        console.error('[proxmox/connect]', err);
        res.status(400).json({ error: `connection failed: ${err.message}` });
      }
    }
  );

  // POST /:siteId/import/platform/proxmox/commit
  router.post(
    '/:siteId/import/platform/proxmox/commit',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(ProxmoxCommitSchema),
    async (req, res) => {
      const { orgId } = req.user;
      const { siteId } = req.params;
      const { deviceId, vms, containers, pools } = req.body;

      try {
        const result = await withOrg(db, orgId, async c => {
          // Ensure os_host exists
          const hostId = await ensureOsHost(c, orgId, siteId, deviceId, 'Proxmox VE');

          let vmCount = 0;
          let containerCount = 0;
          let poolCount = 0;

          // Create VMs (skip duplicates by name+host)
          for (const vm of vms) {
            const exists = await c.query(
              `SELECT id FROM os_vms WHERE org_id=$1 AND site_id=$2 AND host_id=$3 AND name=$4`,
              [orgId, siteId, hostId, vm.name]
            );
            if (exists.rows.length > 0) continue;

            const ramGb = vm.memory ? +(vm.memory / 1073741824).toFixed(2) : null;
            await c.query(
              `INSERT INTO os_vms
                 (org_id, site_id, host_id, parent_vm_id, name, type_id,
                  vm_os, os_version, cpus, ram_gb, ip, extra_ips, drives, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
              [orgId, siteId, hostId, null, vm.name, 'vt-vm',
               null, null, vm.cores ?? null, ramGb,
               null, JSON.stringify([]), JSON.stringify([]),
               `Imported from Proxmox VE (VMID ${vm.vmid ?? ''})`]
            );
            vmCount++;
          }

          // Create LXC containers as os_vms with type vt-lxc (skip duplicates)
          for (const ct of containers) {
            const exists = await c.query(
              `SELECT id FROM os_vms WHERE org_id=$1 AND site_id=$2 AND host_id=$3 AND name=$4`,
              [orgId, siteId, hostId, ct.name]
            );
            if (exists.rows.length > 0) continue;

            const ramGb = ct.memory ? +(ct.memory / 1073741824).toFixed(2) : null;
            await c.query(
              `INSERT INTO os_vms
                 (org_id, site_id, host_id, parent_vm_id, name, type_id,
                  vm_os, os_version, cpus, ram_gb, ip, extra_ips, drives, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
              [orgId, siteId, hostId, null, ct.name, 'vt-lxc',
               null, null, ct.cores ?? null, ramGb,
               null, JSON.stringify([]), JSON.stringify([]),
               `Imported from Proxmox VE (CTID ${ct.vmid ?? ''})`]
            );
            containerCount++;
          }

          // Create storage pools (skip duplicates by name+device)
          for (const pool of pools) {
            const exists = await c.query(
              `SELECT id FROM storage_pools WHERE org_id=$1 AND site_id=$2 AND device_id=$3 AND name=$4`,
              [orgId, siteId, deviceId, pool.storage]
            );
            if (exists.rows.length > 0) continue;

            await c.query(
              `INSERT INTO storage_pools
                 (org_id, site_id, device_id, name, color, pool_type, raid_level, vdev_groups, health, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [orgId, siteId, deviceId, pool.storage, '#4a8fc4',
               mapProxmoxPoolType(pool.type), 'stripe',
               JSON.stringify([]), 'unknown',
               `Imported from Proxmox VE (type: ${pool.type ?? 'unknown'})`]
            );
            poolCount++;
          }

          return { vms: vmCount, containers: containerCount, pools: poolCount };
        });

        res.status(201).json({ created: result });
      } catch (err) {
        console.error(`[POST /api/sites/${req.params.siteId}/import/platform/proxmox/commit]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
