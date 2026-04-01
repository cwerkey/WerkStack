import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSiteStore } from '@/stores/siteStore';
import { useGetDevices } from '@/api/devices';
import { useGetRacks } from '@/api/racks';
import { useGetOsHosts, useGetOsVms, useGetOsApps } from '@/api/os-stack';
import { useGetSiteContainers } from '@/api/containers';
import FilterPills, { type PillGroup } from '@/components/FilterPills';
import QueryErrorState from '@/components/QueryErrorState';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportToCSV } from '@/utils/exportUtils';
import type { DeviceInstance, Rack, OsHost, OsVm, OsApp, Container } from '@werkstack/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPort(p: { hostPort: number; containerPort: number; protocol: 'tcp' | 'udp' }): string {
  if (p.hostPort === p.containerPort) return `:${p.hostPort}`;
  return `:${p.hostPort}→${p.containerPort}`;
}

function formatPorts(ports: Container['ports']): string {
  if (!ports.length) return '';
  return ports.slice(0, 3).map(formatPort).join(' ');
}

type ContainerStatus = Container['status'];

const STATUS_COLOR: Record<ContainerStatus, string> = {
  running: '#22c55e',
  stopped: '#6b7280',
  paused:  '#f59e0b',
  unknown: '#6b7280',
};

// ── Small display atoms ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ContainerStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color,
      padding: '2px 7px',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${color}33`,
      background: `${color}18`,
    }}>
      <span style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
      }} />
      {status}
    </span>
  );
}

function TypeBadge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: muted ? 'var(--color-text-dim)' : 'var(--color-accent)',
      padding: '2px 7px',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${muted ? 'var(--color-border)' : 'var(--color-accent-tint)'}`,
      background: muted ? 'transparent' : 'var(--color-accent-tint)',
    }}>
      {children}
    </span>
  );
}

function IpChip({ ip }: { ip: string }) {
  return (
    <span style={{
      fontSize: 10,
      fontFamily: "'JetBrains Mono', monospace",
      color: 'var(--color-text-muted)',
      padding: '2px 6px',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--color-border)',
      background: 'var(--color-surface-2)',
    }}>
      {ip}
    </span>
  );
}

// ── Expand/collapse chevron button ────────────────────────────────────────────

interface ChevronProps {
  expanded: boolean;
  onToggle: (e: React.MouseEvent) => void;
}

function Chevron({ expanded, onToggle }: ChevronProps) {
  return (
    <button
      className="expand-btn"
      onClick={onToggle}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'var(--color-text-dim)',
        fontSize: 10,
        width: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {expanded ? '▼' : '▶'}
    </button>
  );
}

function LeafConnector({ isLast }: { isLast: boolean }) {
  return (
    <span style={{
      fontSize: 11,
      color: 'var(--color-text-dim)',
      width: 14,
      textAlign: 'center',
      flexShrink: 0,
      fontFamily: 'monospace',
    }}>
      {isLast ? '└─' : '├─'}
    </span>
  );
}

function DashConnector() {
  return (
    <span style={{ width: 14, flexShrink: 0, color: 'var(--color-text-dim)', fontSize: 10, textAlign: 'center' }}>
      —
    </span>
  );
}

// ── Row wrapper ───────────────────────────────────────────────────────────────

function TreeRow({
  indent,
  onClick,
  children,
}: {
  indent: number;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="os-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingTop: 5,
        paddingBottom: 5,
        paddingRight: 10,
        paddingLeft: indent,
        borderRadius: 'var(--radius-sm)',
        cursor: onClick ? 'pointer' : 'default',
        minHeight: 30,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ── Leaf rows: Container & App ────────────────────────────────────────────────

function ContainerRow({ container, isLast }: { container: Container; isLast: boolean }) {
  return (
    <TreeRow indent={60}>
      <LeafConnector isLast={isLast} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        <TypeBadge>container</TypeBadge>
        <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}>
          {container.name}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
          {container.image}:{container.tag}
        </span>
        {container.ports.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
            {formatPorts(container.ports)}
          </span>
        )}
        <StatusBadge status={container.status} />
      </div>
    </TreeRow>
  );
}

function AppRow({ app, isLast }: { app: OsApp; isLast: boolean }) {
  return (
    <TreeRow indent={60}>
      <LeafConnector isLast={isLast} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        <TypeBadge muted>app</TypeBadge>
        <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}>
          {app.name}
        </span>
        {app.version && (
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>v{app.version}</span>
        )}
        {app.url && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            {app.url}
          </span>
        )}
        {app.ip && <IpChip ip={app.ip} />}
      </div>
    </TreeRow>
  );
}

// ── VM subtree (recursive for nested VMs) ─────────────────────────────────────

interface VmSubtreeProps {
  vm: OsVm;
  allVms: OsVm[];
  containers: Container[];
  apps: OsApp[];
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  indent: number;
  isLast: boolean;
}

function VmSubtree({
  vm,
  allVms,
  containers,
  apps,
  expanded,
  toggleExpand,
  indent,
  isLast,
}: VmSubtreeProps) {
  const isExpanded = expanded.has(vm.id);
  const childVms = allVms.filter(v => v.parentVmId === vm.id);
  const vmContainers = containers.filter(c => c.vmId === vm.id && !c.hostId);
  const vmApps = apps.filter(a => a.vmId === vm.id && !a.hostId);
  const hasChildren = childVms.length > 0 || vmContainers.length > 0 || vmApps.length > 0;

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    toggleExpand(vm.id);
  }

  return (
    <>
      <TreeRow indent={indent} onClick={hasChildren ? () => toggleExpand(vm.id) : undefined}>
        {hasChildren ? (
          <Chevron expanded={isExpanded} onToggle={handleToggle} />
        ) : (
          <LeafConnector isLast={isLast} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <TypeBadge>VM</TypeBadge>
          <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}>
            {vm.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
            ({vm.cpus ?? '?'}C / {vm.ramGb ?? '?'}GB)
          </span>
          {vm.ip && <IpChip ip={vm.ip} />}
          {vm.vmOs && (
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {vm.vmOs}{vm.osVersion ? ` ${vm.osVersion}` : ''}
            </span>
          )}
        </div>
      </TreeRow>

      {isExpanded && (
        <>
          {childVms.map((childVm, i) => (
            <VmSubtree
              key={childVm.id}
              vm={childVm}
              allVms={allVms}
              containers={containers}
              apps={apps}
              expanded={expanded}
              toggleExpand={toggleExpand}
              indent={indent + 20}
              isLast={
                i === childVms.length - 1 &&
                vmContainers.length === 0 &&
                vmApps.length === 0
              }
            />
          ))}
          {vmContainers.map((c, i) => (
            <ContainerRow
              key={c.id}
              container={c}
              isLast={i === vmContainers.length - 1 && vmApps.length === 0}
            />
          ))}
          {vmApps.map((a, i) => (
            <AppRow key={a.id} app={a} isLast={i === vmApps.length - 1} />
          ))}
        </>
      )}
    </>
  );
}

// ── OS Host subtree ───────────────────────────────────────────────────────────

interface OsHostSubtreeProps {
  host: OsHost;
  allVms: OsVm[];
  containers: Container[];
  apps: OsApp[];
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
}

function OsHostSubtree({ host, allVms, containers, apps, expanded, toggleExpand }: OsHostSubtreeProps) {
  const isExpanded = expanded.has(host.id);
  const rootVms = allVms.filter(v => v.hostId === host.id && !v.parentVmId);
  const hostContainers = containers.filter(c => c.hostId === host.id && !c.vmId);
  const hostApps = apps.filter(a => a.hostId === host.id && !a.vmId);
  const hasChildren = rootVms.length > 0 || hostContainers.length > 0 || hostApps.length > 0;

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    toggleExpand(host.id);
  }

  return (
    <>
      <TreeRow indent={20} onClick={hasChildren ? () => toggleExpand(host.id) : undefined}>
        {hasChildren ? (
          <Chevron expanded={isExpanded} onToggle={handleToggle} />
        ) : (
          <DashConnector />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            OS:
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}>
            {host.hostOs}{host.osVersion ? ` ${host.osVersion}` : ''}
          </span>
          {host.kernel && (
            <span style={{ fontSize: 11, color: 'var(--color-text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
              {host.kernel}
            </span>
          )}
          {!hasChildren && (
            <span style={{ fontSize: 11, color: 'var(--color-text-dim)', fontStyle: 'italic' }}>
              no VMs or containers
            </span>
          )}
        </div>
      </TreeRow>

      {isExpanded && (
        <>
          {rootVms.map((vm, i) => (
            <VmSubtree
              key={vm.id}
              vm={vm}
              allVms={allVms}
              containers={containers}
              apps={apps}
              expanded={expanded}
              toggleExpand={toggleExpand}
              indent={40}
              isLast={
                i === rootVms.length - 1 &&
                hostContainers.length === 0 &&
                hostApps.length === 0
              }
            />
          ))}
          {hostContainers.map((c, i) => (
            <ContainerRow
              key={c.id}
              container={c}
              isLast={i === hostContainers.length - 1 && hostApps.length === 0}
            />
          ))}
          {hostApps.map((a, i) => (
            <AppRow key={a.id} app={a} isLast={i === hostApps.length - 1} />
          ))}
        </>
      )}
    </>
  );
}

// ── Device card ───────────────────────────────────────────────────────────────

interface DeviceCardProps {
  device: DeviceInstance;
  rack: Rack | undefined;
  osHosts: OsHost[];
  allVms: OsVm[];
  containers: Container[];
  apps: OsApp[];
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  navigate: ReturnType<typeof useNavigate>;
}

function DeviceCard({
  device,
  rack,
  osHosts,
  allVms,
  containers,
  apps,
  expanded,
  toggleExpand,
  navigate,
}: DeviceCardProps) {
  const isExpanded = expanded.has(device.id);
  const deviceHosts = osHosts.filter(h => h.deviceId === device.id);
  const hasChildren = deviceHosts.length > 0;

  function handleToggle() {
    if (hasChildren) toggleExpand(device.id);
  }

  function handleNavigate(e: React.MouseEvent) {
    e.stopPropagation();
    navigate(`/infrastructure/rack/${device.zoneId ?? '_'}/${device.rackId ?? '_'}/${device.id}`);
  }

  return (
    <div style={{
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      marginBottom: 6,
      overflow: 'hidden',
    }}>
      {/* Device header */}
      <div
        className="os-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          cursor: hasChildren ? 'pointer' : 'default',
          borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none',
        }}
        onClick={handleToggle}
      >
        {hasChildren ? (
          <Chevron
            expanded={isExpanded}
            onToggle={e => { e.stopPropagation(); toggleExpand(device.id); }}
          />
        ) : (
          <DashConnector />
        )}

        <span
          className="device-name-link"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
          onClick={handleNavigate}
          title="View in rack"
        >
          {device.name}
        </span>

        {rack && (
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
            {rack.name}{device.rackU != null ? `, U${device.rackU}` : ''}
          </span>
        )}

        {device.ip && <IpChip ip={device.ip} />}

        {device.isDraft && <TypeBadge muted>draft</TypeBadge>}

        <span style={{ flex: 1 }} />

        {!hasChildren && (
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)', fontStyle: 'italic' }}>
            No OS configured
          </span>
        )}
      </div>

      {/* OS hosts */}
      {isExpanded && deviceHosts.length > 0 && (
        <div style={{ padding: '4px 10px 6px' }}>
          {deviceHosts.map(host => (
            <OsHostSubtree
              key={host.id}
              host={host}
              allVms={allVms}
              containers={containers}
              apps={apps}
              expanded={expanded}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

interface CsvRow extends Record<string, string> {
  Device: string;
  Rack: string;
  U: string;
  OS: string;
  VM: string;
  Type: string;
  Name: string;
  ImageOrUrl: string;
  Status: string;
  IP: string;
  Ports: string;
}

function buildCsvRows(
  devices: DeviceInstance[],
  racks: Rack[],
  osHosts: OsHost[],
  allVms: OsVm[],
  containers: Container[],
  apps: OsApp[],
): CsvRow[] {
  const rackMap = new Map(racks.map(r => [r.id, r]));
  const rows: CsvRow[] = [];

  function emitVm(
    vm: OsVm,
    depth: number,
    deviceName: string,
    rackName: string,
    uStr: string,
    osLabel: string,
  ) {
    const prefix = '  '.repeat(depth);
    const vmContainers = containers.filter(c => c.vmId === vm.id);
    const vmApps = apps.filter(a => a.vmId === vm.id);
    const childVms = allVms.filter(v => v.parentVmId === vm.id);
    const hasLeaves = vmContainers.length > 0 || vmApps.length > 0 || childVms.length > 0;

    if (!hasLeaves) {
      rows.push({
        Device: deviceName, Rack: rackName, U: uStr, OS: osLabel,
        VM: `${prefix}${vm.name}`, Type: 'VM', Name: vm.name,
        ImageOrUrl: vm.vmOs ?? '', Status: '', IP: vm.ip ?? '', Ports: '',
      });
    }
    for (const c of vmContainers) {
      rows.push({
        Device: deviceName, Rack: rackName, U: uStr, OS: osLabel,
        VM: `${prefix}${vm.name}`, Type: 'Container', Name: c.name,
        ImageOrUrl: `${c.image}:${c.tag}`, Status: c.status,
        IP: '', Ports: c.ports.map(formatPort).join(' '),
      });
    }
    for (const a of vmApps) {
      rows.push({
        Device: deviceName, Rack: rackName, U: uStr, OS: osLabel,
        VM: `${prefix}${vm.name}`, Type: 'App', Name: a.name,
        ImageOrUrl: a.url ?? '', Status: '', IP: a.ip ?? '', Ports: '',
      });
    }
    for (const child of childVms) {
      emitVm(child, depth + 1, deviceName, rackName, uStr, osLabel);
    }
  }

  for (const device of devices) {
    const rack = device.rackId ? rackMap.get(device.rackId) : undefined;
    const rackName = rack?.name ?? '';
    const uStr = device.rackU != null ? String(device.rackU) : '';
    const deviceHosts = osHosts.filter(h => h.deviceId === device.id);

    if (deviceHosts.length === 0) {
      rows.push({
        Device: device.name, Rack: rackName, U: uStr, OS: '', VM: '',
        Type: '', Name: '', ImageOrUrl: '', Status: '', IP: device.ip ?? '', Ports: '',
      });
      continue;
    }

    for (const host of deviceHosts) {
      const osLabel = `${host.hostOs}${host.osVersion ? ` ${host.osVersion}` : ''}`;
      const rootVms = allVms.filter(v => v.hostId === host.id && !v.parentVmId);
      const hostContainers = containers.filter(c => c.hostId === host.id && !c.vmId);
      const hostApps = apps.filter(a => a.hostId === host.id && !a.vmId);

      if (rootVms.length === 0 && hostContainers.length === 0 && hostApps.length === 0) {
        rows.push({
          Device: device.name, Rack: rackName, U: uStr, OS: osLabel,
          VM: '', Type: '', Name: '', ImageOrUrl: '', Status: '', IP: device.ip ?? '', Ports: '',
        });
      }
      for (const vm of rootVms) {
        emitVm(vm, 0, device.name, rackName, uStr, osLabel);
      }
      for (const c of hostContainers) {
        rows.push({
          Device: device.name, Rack: rackName, U: uStr, OS: osLabel,
          VM: '', Type: 'Container', Name: c.name,
          ImageOrUrl: `${c.image}:${c.tag}`, Status: c.status,
          IP: '', Ports: c.ports.map(formatPort).join(' '),
        });
      }
      for (const a of hostApps) {
        rows.push({
          Device: device.name, Rack: rackName, U: uStr, OS: osLabel,
          VM: '', Type: 'App', Name: a.name,
          ImageOrUrl: a.url ?? '', Status: '', IP: a.ip ?? '', Ports: '',
        });
      }
    }
  }

  return rows;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OsOverviewPage() {
  const navigate = useNavigate();
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';

  const devicesQ = useGetDevices(siteId);
  const { data: devices = [], isLoading: devicesLoading } = devicesQ;
  const { data: racks = [],   isLoading: racksLoading }      = useGetRacks(siteId);
  const { data: osHosts = [], isLoading: hostsLoading }      = useGetOsHosts(siteId);
  const { data: allVms = [],  isLoading: vmsLoading }        = useGetOsVms(siteId);
  const { data: apps = [],    isLoading: appsLoading }       = useGetOsApps(siteId);
  const { data: containers = [], isLoading: containersLoading } = useGetSiteContainers(siteId);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rackFilter, setRackFilter] = useState<string | null>(null);

  const isLoading =
    devicesLoading || racksLoading || hostsLoading ||
    vmsLoading || appsLoading || containersLoading;

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rackMap = new Map(racks.map(r => [r.id, r]));

  const filteredDevices = rackFilter === null
    ? devices
    : devices.filter(d => d.rackId === rackFilter);

  const sortedDevices = [...filteredDevices].sort((a, b) => {
    // Racked devices first, then alphabetically
    const aRacked = a.rackId != null;
    const bRacked = b.rackId != null;
    if (aRacked && !bRacked) return -1;
    if (!aRacked && bRacked) return 1;
    if (a.rackU != null && b.rackU != null) return a.rackU - b.rackU;
    return a.name.localeCompare(b.name);
  });

  const rackPillGroup: PillGroup = {
    key: 'rack',
    label: 'Rack',
    selected: rackFilter,
    onChange: setRackFilter,
    options: racks.map(r => ({ value: r.id, label: r.name })),
  };

  function handleExportCsv() {
    const rows = buildCsvRows(filteredDevices, racks, osHosts, allVms, containers, apps);
    exportToCSV(rows, 'werkstack-os-overview.csv');
  }

  return (
    <div style={{
      padding: '20px 24px',
      minHeight: '100%',
      background: 'var(--color-bg)',
      boxSizing: 'border-box',
    }}>
      <style>{`
        .os-row:hover { background: var(--color-hover) !important; }
        .expand-btn:hover { color: var(--color-accent) !important; }
        .action-btn:hover { background: var(--color-accent) !important; color: var(--color-accent-text) !important; }
        .device-name-link:hover { color: var(--color-accent) !important; text-decoration: underline; }
      `}</style>

      {devicesQ.error && <QueryErrorState error={devicesQ.error} onRetry={() => devicesQ.refetch()} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
            OS Overview
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
            Cascading view of devices, operating systems, VMs, containers, and apps
          </p>
        </div>
        <ExportDropdown
          options={[
            { label: 'Export CSV', onSelect: handleExportCsv },
          ]}
          disabled={isLoading || sortedDevices.length === 0}
        />
      </div>

      {/* Filter pills */}
      {racks.length > 0 && (
        <FilterPills
          groups={[rackPillGroup]}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 0',
          color: 'var(--color-text-dim)',
          fontSize: 13,
        }}>
          Loading...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sortedDevices.length === 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '72px 0',
          gap: 8,
          textAlign: 'center',
        }}>
          <span style={{ fontSize: 36, lineHeight: 1 }}>🖥</span>
          <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>
            No devices found
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-dim)' }}>
            {rackFilter != null
              ? 'No devices in this rack. Select a different rack or view all.'
              : 'Add devices to this site to get started.'}
          </p>
        </div>
      )}

      {/* Tree */}
      {!isLoading && sortedDevices.length > 0 && (
        <div>
          {sortedDevices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              rack={device.rackId ? rackMap.get(device.rackId) : undefined}
              osHosts={osHosts}
              allVms={allVms}
              containers={containers}
              apps={apps}
              expanded={expanded}
              toggleExpand={toggleExpand}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
