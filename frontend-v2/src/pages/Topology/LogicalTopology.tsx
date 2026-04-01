import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
  useEffect,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetDevices } from '@/api/devices';
import { useGetRacks } from '@/api/racks';
import { useGetOsHosts, useGetOsVms, useGetOsApps } from '@/api/os-stack';
import { useGetSiteContainers } from '@/api/containers';
import type { OsHost, OsVm, OsApp, Container, DeviceInstance } from '@werkstack/shared';
import { getIcon, normalizeToSlug } from './simpleIconMap';
import styles from './LogicalTopology.module.css';

/* ─── Public handle ───────────────────────────────────────────────────────── */

export interface LogicalTopologyHandle {
  exportPng: () => Promise<Blob | null>;
  exportSvg: () => string | null;
  fit: () => void;
}

/* ─── Props ───────────────────────────────────────────────────────────────── */

interface Props {
  siteId: string;
  hiddenDevices: Set<string>;
  hiddenHosts: Set<string>;
  hiddenApps: Set<string>;
  onNodeClick: (deviceId: string) => void;
}

/* ─── Internal hierarchy types ────────────────────────────────────────────── */

interface VmNode {
  vm: OsVm;
  apps: OsApp[];
  containers: Container[];
}

interface DeviceNode {
  device: DeviceInstance;
  host: OsHost;
  directApps: OsApp[];
  directContainers: Container[];
  vms: VmNode[];
}

interface ArrowData {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

/* ─── Icon helper ─────────────────────────────────────────────────────────── */

function IconGlyph({ name, size = 12 }: { name: string; size?: number }) {
  const icon = getIcon(name);
  if (!icon) return null;
  return (
    <svg
      className={styles.leafIcon}
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d={icon.path} fill={`#${icon.hex}`} />
    </svg>
  );
}

/* ─── Leaf card (app or container) ───────────────────────────────────────── */

interface LeafCardProps {
  id: string;
  name: string;
  imageOrName: string;
  tag?: string;
  stopped?: boolean;
  leafRef: (el: HTMLDivElement | null) => void;
}

function LeafCard({ id: _id, name, imageOrName, tag, stopped, leafRef }: LeafCardProps) {
  const slug = normalizeToSlug(imageOrName);
  return (
    <div
      ref={leafRef}
      className={[styles.leafCard, stopped ? styles.leafCardStopped : ''].join(' ')}
      title={imageOrName}
    >
      <IconGlyph name={slug} size={12} />
      <span className={styles.leafName}>{name}</span>
      {tag && <span className={styles.leafTag}>{tag}</span>}
    </div>
  );
}

/* ─── VM box ──────────────────────────────────────────────────────────────── */

interface VmBoxProps {
  node: VmNode;
  hiddenApps: Set<string>;
  setLeafRef: (id: string) => (el: HTMLDivElement | null) => void;
}

function VmBox({ node, hiddenApps, setLeafRef }: VmBoxProps) {
  const visibleApps = node.apps.filter(a => !hiddenApps.has(a.id));
  const visibleContainers = node.containers.filter(c => !hiddenApps.has(c.id));

  if (!visibleApps.length && !visibleContainers.length) return null;

  const osLabel = node.vm.vmOs ?? '';

  return (
    <div className={styles.vmBox}>
      <div className={styles.vmHeader}>
        <IconGlyph name={osLabel} size={11} />
        <span className={styles.vmName}>{node.vm.name}</span>
        {osLabel && <span className={styles.vmOs}>{osLabel}</span>}
      </div>
      <div className={styles.vmBody}>
        <div className={styles.leafRow}>
          {visibleApps.map(app => (
            <LeafCard
              key={app.id}
              id={app.id}
              name={app.name}
              imageOrName={app.name}
              tag={app.version}
              leafRef={setLeafRef(app.id)}
            />
          ))}
          {visibleContainers.map(c => (
            <LeafCard
              key={c.id}
              id={c.id}
              name={c.name}
              imageOrName={c.image}
              tag={c.tag !== 'latest' ? c.tag : undefined}
              stopped={c.status === 'stopped' || c.status === 'paused'}
              leafRef={setLeafRef(c.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Device box ──────────────────────────────────────────────────────────── */

interface DeviceBoxProps {
  node: DeviceNode;
  hiddenHosts: Set<string>;
  hiddenApps: Set<string>;
  setLeafRef: (id: string) => (el: HTMLDivElement | null) => void;
  onDeviceClick: () => void;
}

function DeviceBox({ node, hiddenHosts, hiddenApps, setLeafRef, onDeviceClick }: DeviceBoxProps) {
  const hostVisible = !hiddenHosts.has(node.host.id);
  const hostLabel = node.host.osVersion
    ? `${node.host.hostOs} ${node.host.osVersion}`
    : node.host.hostOs;

  // Direct leaves on host
  const directApps = node.directApps.filter(a => !hiddenApps.has(a.id));
  const directContainers = node.directContainers.filter(c => !hiddenApps.has(c.id));
  const hasDirectLeaves = directApps.length > 0 || directContainers.length > 0;
  const hasVms = node.vms.length > 0;

  return (
    <div className={styles.deviceBox}>
      <div className={styles.deviceHeader} onClick={onDeviceClick} title="Open in rack view">
        <span className={styles.deviceName}>{node.device.name}</span>
        {node.device.ip && (
          <span className={styles.deviceIp}>{node.device.ip}</span>
        )}
      </div>

      {hostVisible && (
        <div className={styles.deviceBody}>
          <div className={styles.hostBox}>
            <div className={styles.hostHeader}>
              <IconGlyph name={node.host.hostOs} size={13} />
              <span className={styles.hostName}>{hostLabel}</span>
              {node.host.kernel && (
                <span className={styles.hostVersion}>{node.host.kernel}</span>
              )}
            </div>
            <div className={styles.hostBody}>
              {/* Direct apps/containers on host */}
              {hasDirectLeaves && (
                <div className={styles.leafRow}>
                  {directApps.map(app => (
                    <LeafCard
                      key={app.id}
                      id={app.id}
                      name={app.name}
                      imageOrName={app.name}
                      tag={app.version}
                      leafRef={setLeafRef(app.id)}
                    />
                  ))}
                  {directContainers.map(c => (
                    <LeafCard
                      key={c.id}
                      id={c.id}
                      name={c.name}
                      imageOrName={c.image}
                      tag={c.tag !== 'latest' ? c.tag : undefined}
                      stopped={c.status === 'stopped' || c.status === 'paused'}
                      leafRef={setLeafRef(c.id)}
                    />
                  ))}
                </div>
              )}

              {/* VM boxes */}
              {hasVms && node.vms.map(vmNode => (
                <VmBox
                  key={vmNode.vm.id}
                  node={vmNode}
                  hiddenApps={hiddenApps}
                  setLeafRef={setLeafRef}
                />
              ))}

              {!hasDirectLeaves && !hasVms && (
                <span style={{ fontSize: 11, color: '#6b7b85', fontStyle: 'italic' }}>
                  No apps or containers configured
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Bezier path for arrows ──────────────────────────────────────────────── */

function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
  const cy = (y1 + y2) / 2;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/* ─── Main component ──────────────────────────────────────────────────────── */

const LogicalTopology = forwardRef<LogicalTopologyHandle, Props>(
  ({ siteId, hiddenDevices, hiddenHosts, hiddenApps, onNodeClick }, ref) => {
    const navigate = useNavigate();

    const { data: devices = [] } = useGetDevices(siteId);
    const { data: racks = [] } = useGetRacks(siteId);
    const { data: hosts = [] } = useGetOsHosts(siteId);
    const { data: vms = [] } = useGetOsVms(siteId);
    const { data: apps = [] } = useGetOsApps(siteId);
    const { data: containers = [] } = useGetSiteContainers(siteId);

    const scrollerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const leafRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const [arrows, setArrows] = useState<ArrowData[]>([]);
    const [svgSize, setSvgSize] = useState({ w: 800, h: 600 });

    /* ── Build hierarchy ────────────────────────────────────────────────── */

    const deviceNodes = useMemo<DeviceNode[]>(() => {
      return devices
        .map((device): DeviceNode | null => {
          const host = hosts.find(h => h.deviceId === device.id);
          if (!host) return null;
          const hostVms = vms.filter(v => v.hostId === host.id);
          return {
            device,
            host,
            directApps: apps.filter(a => a.hostId === host.id && !a.vmId),
            directContainers: containers.filter(c => c.hostId === host.id && !c.vmId),
            vms: hostVms.map(vm => ({
              vm,
              apps: apps.filter(a => a.vmId === vm.id),
              containers: containers.filter(c => c.vmId === vm.id),
            })),
          };
        })
        .filter((n): n is DeviceNode => n !== null);
    }, [devices, hosts, vms, apps, containers]);

    const visibleNodes = useMemo(
      () => deviceNodes.filter(n => !hiddenDevices.has(n.device.id)),
      [deviceNodes, hiddenDevices]
    );

    /* ── Leaf ref tracking ──────────────────────────────────────────────── */

    function setLeafRef(id: string) {
      return (el: HTMLDivElement | null) => {
        if (el) leafRefs.current.set(id, el);
        else leafRefs.current.delete(id);
      };
    }

    /* ── Compute dependency arrows ──────────────────────────────────────── */

    useEffect(() => {
      const content = contentRef.current;
      if (!content) return;

      const deps = containers.filter(
        c =>
          c.upstreamDependencyId &&
          !hiddenApps.has(c.id) &&
          !hiddenApps.has(c.upstreamDependencyId)
      );

      if (!deps.length) {
        setArrows([]);
        setSvgSize({ w: content.scrollWidth, h: content.scrollHeight });
        return;
      }

      // Wait one frame so DOM is settled
      const raf = requestAnimationFrame(() => {
        const contentRect = content.getBoundingClientRect();
        const newArrows: ArrowData[] = [];

        for (const c of deps) {
          const srcEl = leafRefs.current.get(c.upstreamDependencyId!);
          const dstEl = leafRefs.current.get(c.id);
          if (!srcEl || !dstEl) continue;

          const srcRect = srcEl.getBoundingClientRect();
          const dstRect = dstEl.getBoundingClientRect();

          newArrows.push({
            id: `${c.upstreamDependencyId}→${c.id}`,
            x1: srcRect.left - contentRect.left + srcRect.width / 2,
            y1: srcRect.top - contentRect.top + srcRect.height / 2,
            x2: dstRect.left - contentRect.left + dstRect.width / 2,
            y2: dstRect.top - contentRect.top + dstRect.height / 2,
          });
        }

        setSvgSize({ w: content.scrollWidth, h: content.scrollHeight });
        setArrows(newArrows);
      });

      return () => cancelAnimationFrame(raf);
    }, [containers, visibleNodes, hiddenApps]);

    /* ── Exposed handle ─────────────────────────────────────────────────── */

    useImperativeHandle(ref, () => ({
      exportPng: async () => {
        const el = contentRef.current;
        if (!el) return null;
        try {
          const { default: html2canvas } = await import('html2canvas');
          const canvas = await html2canvas(el, {
            backgroundColor: '#1a1e21',
            scale: 2,
            useCORS: true,
            logging: false,
          });
          return new Promise<Blob | null>(resolve =>
            canvas.toBlob(resolve, 'image/png')
          );
        } catch (err) {
          console.error('[LogicalTopology] PNG export failed:', err);
          return null;
        }
      },
      exportSvg: () => null, // Falls back to PNG in TopologyPage
      fit: () => {
        scrollerRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      },
    }));

    /* ── Navigation ─────────────────────────────────────────────────────── */

    function handleDeviceClick(node: DeviceNode) {
      const device = node.device;
      const rack = racks.find(r => r.id === device.rackId);
      if (rack) {
        navigate(
          `/infrastructure/rack/${device.zoneId ?? '_'}/${rack.id}/${device.id}`
        );
      } else if (device.zoneId) {
        navigate(`/infrastructure/rack/${device.zoneId}`);
      }
      onNodeClick(device.id);
    }

    /* ── Empty state ─────────────────────────────────────────────────────── */

    if (!visibleNodes.length) {
      return (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🗂</span>
          <p>No configured stacks to display</p>
          <small>
            Add an OS host to a device under the OS/Stack tab to see it here.
          </small>
        </div>
      );
    }

    /* ── Render ─────────────────────────────────────────────────────────── */

    return (
      <div className={styles.scroller} ref={scrollerRef}>
        <div className={styles.content} ref={contentRef}>
          {/* Dependency arrow SVG overlay */}
          {arrows.length > 0 && (
            <svg
              className={styles.svgOverlay}
              width={svgSize.w}
              height={svgSize.h}
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <marker
                  id="lt-arrow"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 8 3, 0 6"
                    fill="#c47c5a"
                    fillOpacity={0.75}
                  />
                </marker>
              </defs>
              {arrows.map(a => (
                <path
                  key={a.id}
                  d={arrowPath(a.x1, a.y1, a.x2, a.y2)}
                  stroke="#c47c5a"
                  strokeWidth={1.5}
                  strokeOpacity={0.55}
                  strokeDasharray="5 3"
                  fill="none"
                  markerEnd="url(#lt-arrow)"
                />
              ))}
            </svg>
          )}

          {/* Device boxes */}
          <div className={styles.deviceGrid}>
            {visibleNodes.map(node => (
              <DeviceBox
                key={node.device.id}
                node={node}
                hiddenHosts={hiddenHosts}
                hiddenApps={hiddenApps}
                setLeafRef={setLeafRef}
                onDeviceClick={() => handleDeviceClick(node)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
);

LogicalTopology.displayName = 'LogicalTopology';
export default LogicalTopology;
