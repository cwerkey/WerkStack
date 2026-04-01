#!/usr/bin/env node
/**
 * Phase 6 seed — adds OS hosts, VMs, apps, containers, and IP assignments
 * to the existing Stress Lab site.
 *
 * Usage:  DATABASE_URL=postgres://werkstack:werkstack_dev@localhost:5433/werkstack node backend/src/db/seed-phase6.js
 */
'use strict';

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://werkstack:werkstack_dev@localhost:5432/werkstack';
const pool = new Pool({ connectionString: DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    // Find the Stress Lab site
    const siteResult = await client.query(`SELECT id, org_id FROM sites WHERE name = 'Stress Lab' LIMIT 1`);
    if (siteResult.rows.length === 0) {
      console.error('[seed-phase6] Stress Lab site not found — run seed-stress.js first');
      process.exit(1);
    }
    const siteId = siteResult.rows[0].id;
    const orgId = siteResult.rows[0].org_id;

    // Check if data already seeded
    const hostCheck = await client.query(
      `SELECT id FROM os_hosts WHERE site_id = $1 LIMIT 1`, [siteId]
    );
    if (hostCheck.rows.length > 0) {
      console.log('[seed-phase6] OS host data already exists — skipping');
      console.log('             DELETE FROM os_hosts WHERE site_id = ... to re-run.');
      await pool.end();
      return;
    }

    // Find server devices to attach OS stacks to
    const devsResult = await client.query(
      `SELECT id, name, ip FROM device_instances
       WHERE site_id = $1 AND type_id = 'dt-server'
       ORDER BY name LIMIT 20`,
      [siteId]
    );
    const servers = devsResult.rows;

    // Find NAS devices
    const nasResult = await client.query(
      `SELECT id, name, ip FROM device_instances
       WHERE site_id = $1 AND type_id = 'dt-nas'
       ORDER BY name LIMIT 6`,
      [siteId]
    );
    const nasDevs = nasResult.rows;

    // Find subnets
    const subResult = await client.query(
      `SELECT id, name, cidr, vlan FROM subnets WHERE site_id = $1 ORDER BY name`, [siteId]
    );
    const subnets = subResult.rows;

    const mgmtSubnet = subnets.find(s => s.name === 'Management');
    const compASubnet = subnets.find(s => s.name === 'Compute-A');
    const compBSubnet = subnets.find(s => s.name === 'Compute-B');
    const storSubnet = subnets.find(s => s.name === 'Storage');

    console.log(`[seed-phase6] Found ${servers.length} servers, ${nasDevs.length} NAS, ${subnets.length} subnets`);

    await client.query('BEGIN');

    // ── OS Hosts ──────────────────────────────────────────────────────────
    // Srv-A01: Proxmox VE hypervisor
    const h1 = await client.query(
      `INSERT INTO os_hosts (org_id, site_id, device_id, host_os, os_version, kernel, notes)
       VALUES ($1,$2,$3,'Proxmox VE','8.2','6.8.12-4-pve','Primary hypervisor node - 3 VMs')
       RETURNING id`,
      [orgId, siteId, servers[0].id]
    );
    const host1Id = h1.rows[0].id;

    // Srv-A02: Ubuntu Server (Docker host)
    const h2 = await client.query(
      `INSERT INTO os_hosts (org_id, site_id, device_id, host_os, os_version, kernel, notes)
       VALUES ($1,$2,$3,'Ubuntu Server','24.04 LTS','6.8.0-45-generic','Docker host - media stack + monitoring')
       RETURNING id`,
      [orgId, siteId, servers[1].id]
    );
    const host2Id = h2.rows[0].id;

    // Srv-A03: Debian (web/reverse proxy)
    const h3 = await client.query(
      `INSERT INTO os_hosts (org_id, site_id, device_id, host_os, os_version, kernel, notes)
       VALUES ($1,$2,$3,'Debian','12 (Bookworm)','6.1.0-26-amd64','Reverse proxy and web services')
       RETURNING id`,
      [orgId, siteId, servers[2].id]
    );
    const host3Id = h3.rows[0].id;

    // Srv-A04: Rocky Linux (database host)
    const h4 = await client.query(
      `INSERT INTO os_hosts (org_id, site_id, device_id, host_os, os_version, kernel, notes)
       VALUES ($1,$2,$3,'Rocky Linux','9.4','5.14.0-427.22.1.el9_4','Database cluster primary')
       RETURNING id`,
      [orgId, siteId, servers[3].id]
    );
    const host4Id = h4.rows[0].id;

    // Srv-A05: Fedora Server (CI/CD)
    const h5 = await client.query(
      `INSERT INTO os_hosts (org_id, site_id, device_id, host_os, os_version, kernel, notes)
       VALUES ($1,$2,$3,'Fedora Server','40','6.9.7-200.fc40','CI/CD runner and build host')
       RETURNING id`,
      [orgId, siteId, servers[4].id]
    );
    const host5Id = h5.rows[0].id;

    // NAS-1: TrueNAS Scale
    const h6 = await client.query(
      `INSERT INTO os_hosts (org_id, site_id, device_id, host_os, os_version, kernel, notes)
       VALUES ($1,$2,$3,'TrueNAS Scale','24.04.2','6.6.44-production+truenas','Primary storage - 24-bay ZFS')
       RETURNING id`,
      [orgId, siteId, nasDevs[0].id]
    );
    const host6Id = h6.rows[0].id;

    console.log('  -> 6 OS hosts created');

    // ── VMs (on Proxmox host Srv-A01) ─────────────────────────────────────
    const vm1 = await client.query(
      `INSERT INTO os_vms (org_id, site_id, host_id, name, type_id, vm_os, os_version, cpus, ram_gb, ip, extra_ips, drives, notes)
       VALUES ($1,$2,$3,'k8s-control-01','vt-vm','Ubuntu Server','22.04',4,8,'10.1.1.100',
         $4, $5, 'Kubernetes control plane node')
       RETURNING id`,
      [orgId, siteId, host1Id,
       JSON.stringify([{label: 'VLAN 200', ip: '10.1.2.100'}]),
       JSON.stringify([{label: 'root', size: '50G', mountpoint: '/'}, {label: 'data', size: '200G', mountpoint: '/var/lib/kubelet'}])]
    );
    const vm1Id = vm1.rows[0].id;

    const vm2 = await client.query(
      `INSERT INTO os_vms (org_id, site_id, host_id, name, type_id, vm_os, os_version, cpus, ram_gb, ip, extra_ips, drives, notes)
       VALUES ($1,$2,$3,'k8s-worker-01','vt-vm','Ubuntu Server','22.04',8,32,'10.1.1.101',
         $4, $5, 'Kubernetes worker node - runs app pods')
       RETURNING id`,
      [orgId, siteId, host1Id,
       JSON.stringify([{label: 'VLAN 200', ip: '10.1.2.101'}]),
       JSON.stringify([{label: 'root', size: '50G', mountpoint: '/'}, {label: 'data', size: '500G', mountpoint: '/var/lib/kubelet'}])]
    );
    const vm2Id = vm2.rows[0].id;

    const vm3 = await client.query(
      `INSERT INTO os_vms (org_id, site_id, host_id, name, type_id, vm_os, os_version, cpus, ram_gb, ip, extra_ips, drives, notes)
       VALUES ($1,$2,$3,'pihole-vm','vt-vm','Debian','12',2,2,'10.1.1.102',
         '[]', $4, 'DNS ad-blocking VM')
       RETURNING id`,
      [orgId, siteId, host1Id,
       JSON.stringify([{label: 'root', size: '20G', mountpoint: '/'}])]
    );
    const vm3Id = vm3.rows[0].id;

    console.log('  -> 3 VMs created');

    // ── Apps ───────────────────────────────────────────────────────────────
    // Apps on Proxmox VMs
    await client.query(
      `INSERT INTO os_apps (org_id, site_id, vm_id, name, type_id, version, url, ip, extra_ips, notes) VALUES
       ($1,$2,$3,'Pi-hole','at-dns','5.18','http://10.1.1.102/admin','10.1.1.102','[]','DNS sinkhole for ad blocking'),
       ($1,$2,$4,'kube-apiserver','at-web','1.30.2','https://10.1.1.100:6443','10.1.1.100','[]','Kubernetes API server'),
       ($1,$2,$5,'nginx-ingress','at-proxy','1.10.1','https://10.1.1.101','10.1.1.101','[]','Kubernetes ingress controller')`,
      [orgId, siteId, vm3Id, vm1Id, vm2Id]
    );

    // Apps on Docker host (Srv-A02) - direct host
    await client.query(
      `INSERT INTO os_apps (org_id, site_id, host_id, name, type_id, version, url, ip, extra_ips, notes) VALUES
       ($1,$2,$3,'Portainer','at-web','2.21.0','https://10.1.1.11:9443','10.1.1.11','[]','Docker management UI'),
       ($1,$2,$3,'Grafana','at-monitoring','11.1.0','http://10.1.1.11:3000','10.1.1.11','[]','Metrics dashboard'),
       ($1,$2,$3,'Prometheus','at-monitoring','2.53.0','http://10.1.1.11:9090','10.1.1.11','[]','Metrics collection')`,
      [orgId, siteId, host2Id]
    );

    // Apps on Debian host (Srv-A03)
    await client.query(
      `INSERT INTO os_apps (org_id, site_id, host_id, name, type_id, version, url, ip, extra_ips, notes) VALUES
       ($1,$2,$3,'Traefik','at-proxy','3.1.0','https://10.1.1.12:8080','10.1.1.12','[]','Reverse proxy and SSL termination'),
       ($1,$2,$3,'Authelia','at-web','4.38.0','https://auth.lab.local','10.1.1.12','[]','SSO and 2FA authentication')`,
      [orgId, siteId, host3Id]
    );

    // Apps on Rocky (Srv-A04)
    await client.query(
      `INSERT INTO os_apps (org_id, site_id, host_id, name, type_id, version, url, ip, extra_ips, notes) VALUES
       ($1,$2,$3,'PostgreSQL','at-db','16.3',null,'10.1.1.13','[]','Primary database server, port 5432'),
       ($1,$2,$3,'pgBouncer','at-db','1.22.0',null,'10.1.1.13','[]','Connection pooler, port 6432')`,
      [orgId, siteId, host4Id]
    );

    // Apps on Fedora CI/CD (Srv-A05)
    await client.query(
      `INSERT INTO os_apps (org_id, site_id, host_id, name, type_id, version, url, ip, extra_ips, notes) VALUES
       ($1,$2,$3,'Gitea','at-web','1.22.0','https://10.1.1.14:3000','10.1.1.14','[]','Self-hosted Git service'),
       ($1,$2,$3,'Woodpecker CI','at-web','2.7.0','https://10.1.1.14:8000','10.1.1.14','[]','CI/CD pipeline runner'),
       ($1,$2,$3,'Docker Registry','at-web','2.8.3','https://10.1.1.14:5000','10.1.1.14','[]','Private container registry')`,
      [orgId, siteId, host5Id]
    );

    console.log('  -> 13 apps created');

    // ── Containers (on Docker host Srv-A02) ───────────────────────────────
    // Media stack compose group
    const c1 = await client.query(
      `INSERT INTO containers (org_id, site_id, host_id, name, image, tag, status, ports, volumes, networks, compose_file, compose_service, notes)
       VALUES ($1,$2,$3,'plex','linuxserver/plex','latest','running',
         $4, $5, '["media_net"]','docker-compose.media.yml','plex','Plex Media Server with GPU transcoding')
       RETURNING id`,
      [orgId, siteId, host2Id,
       JSON.stringify([{hostPort:32400,containerPort:32400,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/opt/plex/config',containerPath:'/config',readOnly:false},{hostPath:'/mnt/media',containerPath:'/media',readOnly:true}])]
    );
    const plexId = c1.rows[0].id;

    const c2 = await client.query(
      `INSERT INTO containers (org_id, site_id, host_id, name, image, tag, status, ports, volumes, networks, compose_file, compose_service, notes)
       VALUES ($1,$2,$3,'sonarr','linuxserver/sonarr','4.0.8','running',
         $4, $5, '["media_net"]','docker-compose.media.yml','sonarr','TV show management and download')
       RETURNING id`,
      [orgId, siteId, host2Id,
       JSON.stringify([{hostPort:8989,containerPort:8989,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/opt/sonarr/config',containerPath:'/config',readOnly:false},{hostPath:'/mnt/media/tv',containerPath:'/tv',readOnly:false}])]
    );
    const sonarrId = c2.rows[0].id;

    const c3 = await client.query(
      `INSERT INTO containers (org_id, site_id, host_id, name, image, tag, status, ports, volumes, networks, compose_file, compose_service, notes)
       VALUES ($1,$2,$3,'radarr','linuxserver/radarr','5.8.3','running',
         $4, $5, '["media_net"]','docker-compose.media.yml','radarr','Movie management and download')
       RETURNING id`,
      [orgId, siteId, host2Id,
       JSON.stringify([{hostPort:7878,containerPort:7878,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/opt/radarr/config',containerPath:'/config',readOnly:false},{hostPath:'/mnt/media/movies',containerPath:'/movies',readOnly:false}])]
    );
    const radarrId = c3.rows[0].id;

    const c4 = await client.query(
      `INSERT INTO containers (org_id, site_id, host_id, name, image, tag, status, ports, volumes, networks, compose_file, compose_service, notes)
       VALUES ($1,$2,$3,'prowlarr','linuxserver/prowlarr','1.21.2','running',
         $4, $5, '["media_net"]','docker-compose.media.yml','prowlarr','Indexer manager for Sonarr/Radarr')
       RETURNING id`,
      [orgId, siteId, host2Id,
       JSON.stringify([{hostPort:9696,containerPort:9696,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/opt/prowlarr/config',containerPath:'/config',readOnly:false}])]
    );
    const prowlarrId = c4.rows[0].id;

    // Set depends_on: sonarr/radarr depend on prowlarr
    await client.query(
      `UPDATE containers SET upstream_dependency_id = $1 WHERE id = ANY($2::uuid[])`,
      [prowlarrId, [sonarrId, radarrId]]
    );

    // Monitoring compose group
    await client.query(
      `INSERT INTO containers (org_id, site_id, host_id, name, image, tag, status, ports, volumes, networks, compose_file, compose_service, notes) VALUES
       ($1,$2,$3,'prometheus','prom/prometheus','v2.53.0','running',
         $4, $5, '["monitoring_net"]','docker-compose.monitoring.yml','prometheus','Metrics collection and alerting'),
       ($1,$2,$3,'grafana','grafana/grafana','11.1.0','running',
         $6, $7, '["monitoring_net"]','docker-compose.monitoring.yml','grafana','Metrics visualization dashboards'),
       ($1,$2,$3,'node-exporter','prom/node-exporter','v1.8.2','running',
         $8, $9, '["monitoring_net"]','docker-compose.monitoring.yml','node-exporter','Host metrics exporter'),
       ($1,$2,$3,'alertmanager','prom/alertmanager','v0.27.0','running',
         $10, $11, '["monitoring_net"]','docker-compose.monitoring.yml','alertmanager','Alert routing and dedup')`,
      [orgId, siteId, host2Id,
       JSON.stringify([{hostPort:9090,containerPort:9090,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/opt/prometheus/data',containerPath:'/prometheus',readOnly:false},{hostPath:'/opt/prometheus/prometheus.yml',containerPath:'/etc/prometheus/prometheus.yml',readOnly:true}]),
       JSON.stringify([{hostPort:3000,containerPort:3000,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/opt/grafana/data',containerPath:'/var/lib/grafana',readOnly:false}]),
       JSON.stringify([{hostPort:9100,containerPort:9100,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/proc',containerPath:'/host/proc',readOnly:true},{hostPath:'/sys',containerPath:'/host/sys',readOnly:true}]),
       JSON.stringify([{hostPort:9093,containerPort:9093,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/opt/alertmanager/config',containerPath:'/etc/alertmanager',readOnly:true}])]
    );

    // Standalone containers (no compose file)
    await client.query(
      `INSERT INTO containers (org_id, site_id, host_id, name, image, tag, status, ports, volumes, networks, notes) VALUES
       ($1,$2,$3,'watchtower','containrrr/watchtower','latest','running',
         '[]', $4, '["bridge"]','Auto-updates running containers'),
       ($1,$2,$3,'portainer','portainer/portainer-ce','2.21.0','running',
         $5, $6, '["bridge"]','Docker management UI'),
       ($1,$2,$3,'redis','redis','7.4-alpine','running',
         $7, $8, '["bridge"]','In-memory cache for app services'),
       ($1,$2,$3,'cadvisor','gcr.io/cadvisor/cadvisor','v0.49.1','stopped',
         $9, '[]', '["monitoring_net"]','Container metrics (disabled)')`,
      [orgId, siteId, host2Id,
       JSON.stringify([{hostPath:'/var/run/docker.sock',containerPath:'/var/run/docker.sock',readOnly:true}]),
       JSON.stringify([{hostPort:9443,containerPort:9443,protocol:'tcp'},{hostPort:8000,containerPort:8000,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/opt/portainer/data',containerPath:'/data',readOnly:false},{hostPath:'/var/run/docker.sock',containerPath:'/var/run/docker.sock',readOnly:true}]),
       JSON.stringify([{hostPort:6379,containerPort:6379,protocol:'tcp'}]),
       JSON.stringify([{hostPath:'/opt/redis/data',containerPath:'/data',readOnly:false}]),
       JSON.stringify([{hostPort:8080,containerPort:8080,protocol:'tcp'}])]
    );

    console.log('  -> 12 containers created (2 compose groups + 4 standalone)');

    // ── IP Assignments ────────────────────────────────────────────────────
    // Management subnet IPs
    if (mgmtSubnet) {
      const mgmtDevices = await client.query(
        `SELECT id, name, ip FROM device_instances
         WHERE site_id = $1 AND ip LIKE '10.0.%' ORDER BY ip LIMIT 20`,
        [siteId]
      );
      for (const dev of mgmtDevices.rows) {
        if (dev.ip) {
          await client.query(
            `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id, label, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (org_id, subnet_id, ip) DO NOTHING`,
            [orgId, siteId, mgmtSubnet.id, dev.ip, dev.id, `${dev.name} mgmt`, null]
          );
        }
      }
      console.log(`  -> ${mgmtDevices.rows.filter(d => d.ip).length} management IPs assigned`);
    }

    // Compute-A subnet IPs (servers with 10.1.1.x)
    if (compASubnet) {
      const compADevices = await client.query(
        `SELECT id, name, ip FROM device_instances
         WHERE site_id = $1 AND ip LIKE '10.1.1.%' ORDER BY ip LIMIT 30`,
        [siteId]
      );
      for (const dev of compADevices.rows) {
        if (dev.ip) {
          await client.query(
            `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id, label, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (org_id, subnet_id, ip) DO NOTHING`,
            [orgId, siteId, compASubnet.id, dev.ip, dev.id, `${dev.name} eth0`, null]
          );
        }
      }
      console.log(`  -> ${compADevices.rows.filter(d => d.ip).length} Compute-A IPs assigned`);

      // VM IPs in Compute-A
      await client.query(
        `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id, label, notes) VALUES
         ($1,$2,$3,'10.1.1.100',$4,'k8s-control-01 eth0','Kubernetes control plane'),
         ($1,$2,$3,'10.1.1.101',$4,'k8s-worker-01 eth0','Kubernetes worker'),
         ($1,$2,$3,'10.1.1.102',$4,'pihole-vm eth0','Pi-hole DNS')
         ON CONFLICT (org_id, subnet_id, ip) DO NOTHING`,
        [orgId, siteId, compASubnet.id, servers[0].id]
      );
      console.log('  -> 3 VM IPs assigned to Compute-A');
    }

    // Compute-B subnet IPs (VM secondary IPs)
    if (compBSubnet) {
      const compBDevices = await client.query(
        `SELECT id, name, ip FROM device_instances
         WHERE site_id = $1 AND ip LIKE '10.1.2.%' ORDER BY ip LIMIT 30`,
        [siteId]
      );
      for (const dev of compBDevices.rows) {
        if (dev.ip) {
          await client.query(
            `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id, label, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (org_id, subnet_id, ip) DO NOTHING`,
            [orgId, siteId, compBSubnet.id, dev.ip, dev.id, `${dev.name} eth0`, null]
          );
        }
      }
      // VM secondary IPs
      await client.query(
        `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id, label, notes) VALUES
         ($1,$2,$3,'10.1.2.100',$4,'k8s-control-01 vlan200','K8s control VLAN 200'),
         ($1,$2,$3,'10.1.2.101',$4,'k8s-worker-01 vlan200','K8s worker VLAN 200')
         ON CONFLICT (org_id, subnet_id, ip) DO NOTHING`,
        [orgId, siteId, compBSubnet.id, servers[0].id]
      );
      console.log(`  -> Compute-B IPs assigned`);
    }

    // Storage subnet IPs
    if (storSubnet) {
      const storDevices = await client.query(
        `SELECT id, name, ip FROM device_instances
         WHERE site_id = $1 AND ip LIKE '10.1.3.%' ORDER BY ip LIMIT 10`,
        [siteId]
      );
      for (const dev of storDevices.rows) {
        if (dev.ip) {
          await client.query(
            `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id, label, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (org_id, subnet_id, ip) DO NOTHING`,
            [orgId, siteId, storSubnet.id, dev.ip, dev.id, `${dev.name} stor`, null]
          );
        }
      }
      console.log(`  -> ${storDevices.rows.filter(d => d.ip).length} Storage IPs assigned`);
    }

    await client.query('COMMIT');

    console.log('');
    console.log('[seed-phase6] done!');
    console.log('');
    console.log('  OS Hosts:     6 (Proxmox, Ubuntu, Debian, Rocky, Fedora, TrueNAS)');
    console.log('  VMs:          3 (k8s-control, k8s-worker, pihole)');
    console.log('  Apps:         13 (spread across hosts and VMs)');
    console.log('  Containers:   12 (2 compose groups + 4 standalone)');
    console.log('  IP assignments: ~50+ across 4 subnets');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed-phase6] error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('[seed-phase6] failed:', err);
  process.exit(1);
});
