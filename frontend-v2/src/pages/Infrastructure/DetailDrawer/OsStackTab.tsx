import { useState, useMemo } from 'react';
import type {
  DeviceInstance,
  OsHost,
  OsVm,
  OsApp,
  Container,
} from '@werkstack/shared';
import styles from './OsStackTab.module.css';

// -- Types --------------------------------------------------------------------

interface OsStackTabProps {
  device:           DeviceInstance;
  hosts:            OsHost[];
  vms:              OsVm[];
  apps:             OsApp[];
  containers:       Container[];
  onAddVm:          (hostId: string) => void;
  onAddContainer:   () => void;
  onImportCompose:  () => void;
}

// -- Helpers ------------------------------------------------------------------

function statusClass(status: Container['status']): string {
  switch (status) {
    case 'running': return styles.statusRunning;
    case 'stopped': return styles.statusStopped;
    case 'paused':  return styles.statusPaused;
    default:        return styles.statusUnknown;
  }
}

function portsSummary(ports: Container['ports']): string {
  if (ports.length === 0) return '';
  if (ports.length <= 2) {
    return ports.map(p => `${p.hostPort}:${p.containerPort}/${p.protocol}`).join(', ');
  }
  return `${ports[0].hostPort}:${ports[0].containerPort} +${ports.length - 1}`;
}

/** Basic href sanitizer -- only allow http(s) */
function safeHref(url: string | undefined): string {
  if (!url) return '#';
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return url;
  } catch {
    // If it looks like a bare domain/path, prepend https
    if (/^[a-z0-9][\w.-]+/i.test(url) && !url.includes(' ')) {
      return `https://${url}`;
    }
  }
  return '#';
}

// -- Main component -----------------------------------------------------------

export function OsStackTab({
  device,
  hosts,
  vms,
  apps,
  containers,
  onAddVm,
  onAddContainer,
  onImportCompose,
}: OsStackTabProps) {
  const [expandedVmId, setExpandedVmId] = useState<string | null>(null);
  const [expandedContainerId, setExpandedContainerId] = useState<string | null>(null);
  const [collapsedComposeFiles, setCollapsedComposeFiles] = useState<Set<string>>(new Set());

  // -- Filter data to this device ---------------------------------------------

  const host = useMemo(
    () => hosts.find(h => h.deviceId === device.id) ?? null,
    [hosts, device.id],
  );

  const hostVms = useMemo(
    () => host ? vms.filter(v => v.hostId === host.id) : [],
    [vms, host],
  );

  const hostContainers = useMemo(
    () => host
      ? containers.filter(c => c.hostId === host.id)
      : containers.filter(c => c.hostId === device.id),
    [containers, host, device.id],
  );

  const hostApps = useMemo(
    () => host
      ? apps.filter(a => a.hostId === host.id || hostVms.some(v => v.id === a.vmId))
      : [],
    [apps, host, hostVms],
  );

  // -- Compose grouping -------------------------------------------------------

  const { composeGroups, ungroupedContainers } = useMemo(() => {
    const groups: Record<string, Container[]> = {};
    const ungrouped: Container[] = [];
    for (const c of hostContainers) {
      if (c.composeFile) {
        if (!groups[c.composeFile]) groups[c.composeFile] = [];
        groups[c.composeFile].push(c);
      } else {
        ungrouped.push(c);
      }
    }
    return { composeGroups: groups, ungroupedContainers: ungrouped };
  }, [hostContainers]);

  // -- Toggle helpers ---------------------------------------------------------

  function toggleVm(vmId: string) {
    setExpandedVmId(prev => prev === vmId ? null : vmId);
  }

  function toggleContainer(containerId: string) {
    setExpandedContainerId(prev => prev === containerId ? null : containerId);
  }

  function toggleComposeGroup(file: string) {
    setCollapsedComposeFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }

  // -- Render -----------------------------------------------------------------

  return (
    <div className={styles.tab}>

      {/* -- Host OS Section ------------------------------------------------- */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Host OS</span>
        </div>
        {host ? (
          <div className={styles.hostRow}>
            <span className={styles.hostName}>
              {host.hostOs}{host.osVersion ? ` ${host.osVersion}` : ''}
            </span>
            <div className={styles.hostMeta}>
              {host.kernel && (
                <span className={styles.hostMetaItem}>{host.kernel}</span>
              )}
              {device.ip && (
                <span className={styles.hostMetaItem}>{device.ip}</span>
              )}
            </div>
            {host.notes && (
              <span style={{ fontSize: 10, color: '#5a6068', marginTop: 2 }}>
                {host.notes}
              </span>
            )}
          </div>
        ) : (
          <p className={styles.empty}>No host OS configured</p>
        )}
      </div>

      {/* -- VMs Section ----------------------------------------------------- */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            VMs ({hostVms.length})
          </span>
          {host && (
            <button
              className={styles.addBtn}
              onClick={() => onAddVm(host.id)}
            >
              + Add VM
            </button>
          )}
        </div>

        {hostVms.length === 0 && (
          <p className={styles.empty}>No virtual machines</p>
        )}

        {hostVms.map(vm => (
          <div key={vm.id}>
            <VmRow
              vm={vm}
              expanded={expandedVmId === vm.id}
              onClick={() => toggleVm(vm.id)}
            />
            {expandedVmId === vm.id && (
              <VmDetail
                vm={vm}
                apps={apps.filter(a => a.vmId === vm.id)}
                containers={containers.filter(c => c.vmId === vm.id)}
              />
            )}
          </div>
        ))}
      </div>

      {/* -- Containers Section ---------------------------------------------- */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            Containers ({hostContainers.length})
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={styles.addBtn} onClick={onImportCompose}>
              Import Compose
            </button>
            <button className={styles.addBtn} onClick={onAddContainer}>
              + Add Container
            </button>
          </div>
        </div>

        {hostContainers.length === 0 && (
          <p className={styles.empty}>No containers</p>
        )}

        {/* Compose file groups */}
        {Object.entries(composeGroups).map(([file, groupContainers]) => {
          const collapsed = collapsedComposeFiles.has(file);
          return (
            <div key={file} className={styles.composeGroup}>
              <div
                className={styles.composeHeader}
                onClick={() => toggleComposeGroup(file)}
              >
                <span className={styles.composeIcon}>
                  {collapsed ? '\u25B8' : '\u25BE'}
                </span>
                {file}
                <span style={{ color: '#5a6068', marginLeft: 4 }}>
                  ({groupContainers.length})
                </span>
              </div>
              {!collapsed && groupContainers.map(c => (
                <div key={c.id}>
                  <ContainerRow
                    container={c}
                    expanded={expandedContainerId === c.id}
                    onClick={() => toggleContainer(c.id)}
                  />
                  {expandedContainerId === c.id && (
                    <ContainerDetail container={c} />
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {/* Ungrouped containers */}
        {ungroupedContainers.map(c => (
          <div key={c.id}>
            <ContainerRow
              container={c}
              expanded={expandedContainerId === c.id}
              onClick={() => toggleContainer(c.id)}
            />
            {expandedContainerId === c.id && (
              <ContainerDetail container={c} />
            )}
          </div>
        ))}
      </div>

      {/* -- Apps Section ---------------------------------------------------- */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            Apps ({hostApps.length})
          </span>
        </div>

        {hostApps.length === 0 && (
          <p className={styles.empty}>No apps configured</p>
        )}

        {hostApps.map(app => (
          <AppRow key={app.id} app={app} />
        ))}
      </div>

      {/* -- Visual Stack Diagram -------------------------------------------- */}
      {host && (
        <div>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Stack</span>
          </div>
          <VisualStack
            device={device}
            host={host}
            vms={hostVms}
            apps={hostApps}
            containers={hostContainers}
          />
        </div>
      )}
    </div>
  );
}

// -- VM Row -------------------------------------------------------------------

interface VmRowProps {
  vm: OsVm;
  expanded: boolean;
  onClick: () => void;
}

function VmRow({ vm, expanded, onClick }: VmRowProps) {
  return (
    <div className={styles.row} onClick={onClick}>
      <span className={styles.rowName}>{vm.name}</span>
      {vm.cpus != null && (
        <span className={`${styles.badge} ${styles.badgeCpu}`}>
          {vm.cpus}C
        </span>
      )}
      {vm.ramGb != null && (
        <span className={`${styles.badge} ${styles.badgeRam}`}>
          {vm.ramGb}GB
        </span>
      )}
      {vm.ip && <span className={styles.badgeIp}>{vm.ip}</span>}
      <span className={styles.expandArrow}>{expanded ? '\u25BE' : '\u25B8'}</span>
    </div>
  );
}

// -- VM Detail (expanded) -----------------------------------------------------

interface VmDetailProps {
  vm: OsVm;
  apps: OsApp[];
  containers: Container[];
}

function VmDetail({ vm, apps, containers }: VmDetailProps) {
  return (
    <div className={styles.expandDetail}>
      {/* OS info */}
      {vm.vmOs && (
        <>
          <span className={styles.detailTitle}>OS</span>
          <span className={styles.detailItem}>
            {vm.vmOs}{vm.osVersion ? ` ${vm.osVersion}` : ''}
          </span>
        </>
      )}

      {/* Drives */}
      {vm.drives.length > 0 && (
        <>
          <span className={styles.detailTitle}>Disks</span>
          {vm.drives.map((d, i) => (
            <span key={i} className={styles.detailItem}>
              {d.label || `disk-${i}`}: {d.size}{d.mountpoint ? ` @ ${d.mountpoint}` : ''}
            </span>
          ))}
        </>
      )}

      {/* Extra IPs */}
      {vm.extraIps.length > 0 && (
        <>
          <span className={styles.detailTitle}>Network</span>
          {vm.extraIps.map((ip, i) => (
            <span key={i} className={styles.detailItem}>
              {ip.label}: {ip.ip}
            </span>
          ))}
        </>
      )}

      {/* Apps on this VM */}
      {apps.length > 0 && (
        <>
          <span className={styles.detailTitle}>Apps ({apps.length})</span>
          {apps.map(a => (
            <span key={a.id} className={styles.detailItem}>
              {a.name}{a.version ? ` v${a.version}` : ''}
              {a.ip ? ` (${a.ip})` : ''}
            </span>
          ))}
        </>
      )}

      {/* Containers on this VM */}
      {containers.length > 0 && (
        <>
          <span className={styles.detailTitle}>Containers ({containers.length})</span>
          {containers.map(c => (
            <span key={c.id} className={styles.detailItem}>
              {c.name} {c.image}:{c.tag}
            </span>
          ))}
        </>
      )}

      {/* Notes */}
      {vm.notes && (
        <>
          <span className={styles.detailTitle}>Notes</span>
          <span className={styles.detailItem}>{vm.notes}</span>
        </>
      )}
    </div>
  );
}

// -- Container Row ------------------------------------------------------------

interface ContainerRowProps {
  container: Container;
  expanded: boolean;
  onClick: () => void;
}

function ContainerRow({ container, expanded, onClick }: ContainerRowProps) {
  const summary = portsSummary(container.ports);

  return (
    <div className={styles.row} onClick={onClick}>
      <span className={styles.rowName}>{container.name}</span>
      <span className={styles.imageTag}>
        {container.image}:{container.tag}
      </span>
      <span className={`${styles.statusBadge} ${statusClass(container.status)}`}>
        {container.status}
      </span>
      {summary && <span className={styles.portsSummary}>{summary}</span>}
      <span className={styles.expandArrow}>{expanded ? '\u25BE' : '\u25B8'}</span>
    </div>
  );
}

// -- Container Detail (expanded) ----------------------------------------------

function ContainerDetail({ container }: { container: Container }) {
  return (
    <div className={styles.expandDetail}>
      {/* Port mappings */}
      {container.ports.length > 0 && (
        <>
          <span className={styles.detailTitle}>Ports</span>
          {container.ports.map((p, i) => (
            <span key={i} className={styles.detailItem}>
              {p.hostPort}:{p.containerPort}/{p.protocol}
            </span>
          ))}
        </>
      )}

      {/* Volume mounts */}
      {container.volumes.length > 0 && (
        <>
          <span className={styles.detailTitle}>Volumes</span>
          {container.volumes.map((v, i) => (
            <span key={i} className={styles.detailItem}>
              {v.hostPath} -&gt; {v.containerPath}{v.readOnly ? ' (ro)' : ''}
            </span>
          ))}
        </>
      )}

      {/* Networks */}
      {container.networks.length > 0 && (
        <>
          <span className={styles.detailTitle}>Networks</span>
          {container.networks.map((n, i) => (
            <span key={i} className={styles.detailItem}>{n}</span>
          ))}
        </>
      )}

      {/* Compose info */}
      {container.composeFile && (
        <>
          <span className={styles.detailTitle}>Compose</span>
          <span className={styles.detailItem}>
            {container.composeFile}
            {container.composeService ? ` / ${container.composeService}` : ''}
          </span>
        </>
      )}

      {/* Notes */}
      {container.notes && (
        <>
          <span className={styles.detailTitle}>Notes</span>
          <span className={styles.detailItem}>{container.notes}</span>
        </>
      )}
    </div>
  );
}

// -- App Row ------------------------------------------------------------------

function AppRow({ app }: { app: OsApp }) {
  const href = safeHref(app.url);

  return (
    <div className={styles.row} style={{ cursor: 'default' }}>
      <span className={styles.rowName}>{app.name}</span>
      {app.version && (
        <span className={styles.appVersion}>v{app.version}</span>
      )}
      {app.ip && <span className={styles.appPort}>{app.ip}</span>}
      {app.url && (
        <a
          className={styles.appUrl}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
        >
          {app.url}
        </a>
      )}
    </div>
  );
}

// -- Visual Stack Diagram -----------------------------------------------------

interface VisualStackProps {
  device: DeviceInstance;
  host: OsHost;
  vms: OsVm[];
  apps: OsApp[];
  containers: Container[];
}

function VisualStack({ device, host, vms, apps, containers }: VisualStackProps) {
  // Build layers bottom-up
  const layers: { label: string; meta: string; className: string }[] = [];

  // Device layer (bottom)
  layers.push({
    label: device.name + (device.rackU != null ? ` (U${device.rackU})` : ''),
    meta: device.ip ?? '',
    className: styles.stackDevice,
  });

  // OS layer
  layers.push({
    label: host.hostOs + (host.osVersion ? ` ${host.osVersion}` : ''),
    meta: host.kernel ?? '',
    className: styles.stackOs,
  });

  // VM layers
  for (const vm of vms) {
    const specs: string[] = [];
    if (vm.cpus != null) specs.push(`${vm.cpus}C`);
    if (vm.ramGb != null) specs.push(`${vm.ramGb}GB`);
    layers.push({
      label: `VM: ${vm.name}`,
      meta: [specs.join('/'), vm.ip].filter(Boolean).join(' '),
      className: styles.stackVm,
    });
  }

  // Containers layer (summary)
  if (containers.length > 0) {
    const names = containers.slice(0, 3).map(c => c.name);
    const suffix = containers.length > 3 ? ` +${containers.length - 3}` : '';
    layers.push({
      label: `Containers: ${names.join(', ')}${suffix}`,
      meta: `${containers.filter(c => c.status === 'running').length}/${containers.length} running`,
      className: styles.stackContainers,
    });
  }

  // Apps layer (summary)
  if (apps.length > 0) {
    const names = apps.slice(0, 3).map(a => a.name);
    const suffix = apps.length > 3 ? ` +${apps.length - 3}` : '';
    layers.push({
      label: `Apps: ${names.join(', ')}${suffix}`,
      meta: '',
      className: styles.stackApps,
    });
  }

  // Render top-to-bottom (reverse the bottom-up order)
  const reversed = [...layers].reverse();

  return (
    <div className={styles.stackDiagram}>
      {reversed.map((layer, i) => (
        <div key={i} className={`${styles.stackLayer} ${layer.className}`}>
          <span className={styles.stackLayerLabel}>{layer.label}</span>
          {layer.meta && (
            <span className={styles.stackLayerMeta}>{layer.meta}</span>
          )}
        </div>
      ))}
    </div>
  );
}
