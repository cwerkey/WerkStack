import { useMemo } from 'react';
import type {
  DeviceInstance,
  Subnet,
  IpAssignment,
  Connection,
  OsHost,
  OsVm,
  OsApp,
  Container,
} from '@werkstack/shared';
import styles from './NetworkTab.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NetworkTabProps {
  device:            DeviceInstance;
  subnets:           Subnet[];
  allIpAssignments:  IpAssignment[];     // all IPs in the site
  connections:       Connection[];       // device's connections
  hosts:             OsHost[];
  vms:               OsVm[];
  apps:              OsApp[];
  containers:        Container[];
  onAssignIp:        () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Deterministic color from a VLAN number */
function vlanColor(vlan: number): string {
  const COLORS = [
    '#4a6a8a', '#6a8a4a', '#8a6a8a', '#8a8a4a',
    '#4a8a8a', '#8a4a6a', '#6a6a8a', '#6a8a6a',
  ];
  return COLORS[vlan % COLORS.length];
}

interface NetworkInterface {
  source:  'mgmt' | 'host' | 'vm' | 'app' | 'container';
  name:    string;
  ip:      string;
}

function gatherInterfaces(
  device: DeviceInstance,
  hosts: OsHost[],
  vms: OsVm[],
  apps: OsApp[],
  containers: Container[],
): NetworkInterface[] {
  const result: NetworkInterface[] = [];

  // Management IP from device itself
  if (device.ip) {
    result.push({ source: 'mgmt', name: device.name, ip: device.ip });
  }

  // Host OS — no IP field on OsHost, but we include it if present in the future
  const deviceHosts = hosts.filter(h => h.deviceId === device.id);
  for (const host of deviceHosts) {
    // VMs under this host
    const hostVms = vms.filter(v => v.hostId === host.id);
    for (const vm of hostVms) {
      if (vm.ip) {
        result.push({ source: 'vm', name: vm.name, ip: vm.ip });
      }
      for (const extra of vm.extraIps ?? []) {
        result.push({ source: 'vm', name: `${vm.name} (${extra.label})`, ip: extra.ip });
      }

      // Apps under this VM
      const vmApps = apps.filter(a => a.vmId === vm.id);
      for (const app of vmApps) {
        if (app.ip) {
          result.push({ source: 'app', name: app.name, ip: app.ip });
        }
        for (const extra of app.extraIps ?? []) {
          result.push({ source: 'app', name: `${app.name} (${extra.label})`, ip: extra.ip });
        }
      }
    }

    // Apps directly on the host (no VM)
    const hostApps = apps.filter(a => a.hostId === host.id && !a.vmId);
    for (const app of hostApps) {
      if (app.ip) {
        result.push({ source: 'app', name: app.name, ip: app.ip });
      }
      for (const extra of app.extraIps ?? []) {
        result.push({ source: 'app', name: `${app.name} (${extra.label})`, ip: extra.ip });
      }
    }
  }

  // Containers (may be on a host or VM, but we just look at all that belong to device hosts)
  const hostIds = new Set(deviceHosts.map(h => h.id));
  const deviceVmIds = new Set(vms.filter(v => hostIds.has(v.hostId)).map(v => v.id));
  const deviceContainers = containers.filter(
    c => (c.hostId && hostIds.has(c.hostId)) || (c.vmId && deviceVmIds.has(c.vmId)),
  );
  for (const ctr of deviceContainers) {
    for (const port of ctr.ports ?? []) {
      result.push({
        source: 'container',
        name: `${ctr.name} :${port.containerPort}/${port.protocol}`,
        ip: `0.0.0.0:${port.hostPort}`,
      });
    }
  }

  return result;
}

// ─── Source badge class helper ──────────────────────────────────────────────

function sourceClass(source: NetworkInterface['source']): string {
  switch (source) {
    case 'mgmt':      return styles.sourceMgmt;
    case 'host':      return styles.sourceHost;
    case 'vm':        return styles.sourceVm;
    case 'app':       return styles.sourceApp;
    case 'container': return styles.sourceContainer;
  }
}

// ─── Main component ─────────────────────────────────────────────────────────

export function NetworkTab({
  device,
  subnets,
  allIpAssignments,
  connections,
  hosts,
  vms,
  apps,
  containers,
  onAssignIp,
}: NetworkTabProps) {
  const subnetMap = useMemo(
    () => new Map(subnets.map(s => [s.id, s])),
    [subnets],
  );

  // ── Device's IP assignments ────────────────────────────────────────────

  const deviceIps = useMemo(
    () => allIpAssignments.filter(ip => ip.deviceId === device.id),
    [allIpAssignments, device.id],
  );

  // ── VLAN memberships (derived from device IPs + subnet data) ───────────

  const vlanMemberships = useMemo(() => {
    const map = new Map<number, { vlan: number; cidr: string; subnetName: string; count: number }>();
    for (const ip of deviceIps) {
      const subnet = subnetMap.get(ip.subnetId);
      if (!subnet || subnet.vlan == null) continue;
      const existing = map.get(subnet.vlan);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(subnet.vlan, {
          vlan: subnet.vlan,
          cidr: subnet.cidr,
          subnetName: subnet.name,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.vlan - b.vlan);
  }, [deviceIps, subnetMap]);

  // ── Subnet info (subnets this device has IPs in) ───────────────────────

  const deviceSubnets = useMemo(() => {
    const countBySubnet = new Map<string, number>();
    for (const ip of deviceIps) {
      countBySubnet.set(ip.subnetId, (countBySubnet.get(ip.subnetId) ?? 0) + 1);
    }
    return Array.from(countBySubnet.entries())
      .map(([subnetId, count]) => ({ subnet: subnetMap.get(subnetId), count }))
      .filter((x): x is { subnet: Subnet; count: number } => !!x.subnet);
  }, [deviceIps, subnetMap]);

  // ── All interfaces ─────────────────────────────────────────────────────

  const interfaces = useMemo(
    () => gatherInterfaces(device, hosts, vms, apps, containers),
    [device, hosts, vms, apps, containers],
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab}>

      {/* ── IP Assignments ─────────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            IP Assignments ({deviceIps.length})
          </span>
          <button className={styles.addBtn} onClick={onAssignIp}>
            + Assign IP
          </button>
        </div>

        {deviceIps.length === 0 && (
          <p className={styles.empty}>No IP assignments</p>
        )}

        {deviceIps.map(ip => {
          const subnet = subnetMap.get(ip.subnetId);
          return (
            <div key={ip.id} className={styles.ipRow}>
              <span className={styles.ipAddress}>{ip.ip}</span>
              {subnet && (
                <span className={styles.ipSubnet}>{subnet.name}</span>
              )}
              {subnet?.vlan != null && (
                <span
                  className={styles.vlanBadge}
                  style={{ background: vlanColor(subnet.vlan) }}
                >
                  VLAN {subnet.vlan}
                </span>
              )}
              {ip.label && (
                <span className={styles.ipLabel}>{ip.label}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── VLAN Memberships ───────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            VLAN Memberships ({vlanMemberships.length})
          </span>
        </div>

        {vlanMemberships.length === 0 && (
          <p className={styles.empty}>No VLAN memberships</p>
        )}

        {vlanMemberships.map(v => (
          <div key={v.vlan} className={styles.vlanRow}>
            <span
              className={styles.vlanBadge}
              style={{ background: vlanColor(v.vlan) }}
            >
              VLAN {v.vlan}
            </span>
            <span className={styles.vlanCidr}>{v.cidr}</span>
            <span className={styles.vlanCount}>
              {v.count} IP{v.count !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>

      {/* ── Subnet Info ────────────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            Subnets ({deviceSubnets.length})
          </span>
        </div>

        {deviceSubnets.length === 0 && (
          <p className={styles.empty}>No subnet associations</p>
        )}

        {deviceSubnets.map(({ subnet, count }) => (
          <div key={subnet.id} className={styles.subnetRow}>
            <span className={styles.subnetName}>{subnet.name}</span>
            <span className={styles.subnetCidr}>{subnet.cidr}</span>
            {subnet.gateway && (
              <span className={styles.subnetGateway}>gw {subnet.gateway}</span>
            )}
            {subnet.vlan != null && (
              <span
                className={styles.vlanBadge}
                style={{ background: vlanColor(subnet.vlan) }}
              >
                VLAN {subnet.vlan}
              </span>
            )}
            <span className={styles.subnetIpCount}>
              {count} IP{count !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>

      {/* ── All Interfaces ─────────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            All Interfaces ({interfaces.length})
          </span>
        </div>

        {interfaces.length === 0 && (
          <p className={styles.empty}>No network interfaces detected</p>
        )}

        {interfaces.map((iface, idx) => (
          <div key={`${iface.source}-${iface.ip}-${idx}`} className={styles.interfaceRow}>
            <span className={`${styles.interfaceSource} ${sourceClass(iface.source)}`}>
              {iface.source}
            </span>
            <span className={styles.interfaceName}>{iface.name}</span>
            <span className={styles.interfaceIp}>{iface.ip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
