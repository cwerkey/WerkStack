import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSiteStore } from '@/stores/siteStore';
import { useGetDevices } from '@/api/devices';
import { useGetRacks } from '@/api/racks';
import { useGetOsHosts } from '@/api/os-stack';
import { useGetSiteContainers } from '@/api/containers';
import { useGetOsApps } from '@/api/os-stack';
import { TopologyFilterPanel } from './TopologyFilterPanel';
import { LogicalFilterPanel } from './LogicalFilterPanel';
import type { PhysicalTopologyHandle } from './PhysicalTopology';
import type { LogicalTopologyHandle } from './LogicalTopology';
import QueryErrorState from '@/components/QueryErrorState';
import styles from './TopologyPage.module.css';

type Mode = 'physical' | 'logical';

// Common handle shape shared by both topology modes
type TopologyHandle = PhysicalTopologyHandle | LogicalTopologyHandle;

// Lazy load heavy topology renderers
const LazyPhysicalTopology = lazy(() => import('./PhysicalTopology'));
const LazyLogicalTopology = lazy(() => import('./LogicalTopology'));

export default function TopologyPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';
  const navigate = useNavigate();
  const devicesQ = useGetDevices(siteId);
  const { data: devices = [] } = devicesQ;
  const { data: racks = [] } = useGetRacks(siteId);
  const { data: hosts = [] } = useGetOsHosts(siteId);
  const { data: apps = [] } = useGetOsApps(siteId);
  const { data: containers = [] } = useGetSiteContainers(siteId);

  const handleNodeClick = useCallback((deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;
    const rack = racks.find(r => r.id === device.rackId);
    if (rack) {
      navigate(`/infrastructure/rack/${device.zoneId ?? '_'}/${rack.id}/${deviceId}`);
    } else if (device.zoneId) {
      navigate(`/infrastructure/rack/${device.zoneId}`);
    }
  }, [devices, racks, navigate]);

  const [mode, setMode] = useState<Mode>('physical');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Separate refs for each mode so both can be mounted simultaneously if needed
  const physicalRef = useRef<PhysicalTopologyHandle>(null);
  const logicalRef = useRef<LogicalTopologyHandle>(null);

  // Physical filter state
  const [rackFilter, setRackFilter] = useState<Set<string> | null>(null);
  const [switchFilter, setSwitchFilter] = useState<string | null>(null);
  const [vlanFilter, setVlanFilter] = useState<Set<number> | null>(null);

  // Logical filter state
  const [hiddenDevices, setHiddenDevices] = useState<Set<string>>(new Set());
  const [hiddenHosts, setHiddenHosts] = useState<Set<string>>(new Set());
  const [hiddenApps, setHiddenApps] = useState<Set<string>>(new Set());

  // Active topology ref based on current mode
  const activeRef = (): TopologyHandle | null =>
    mode === 'physical' ? physicalRef.current : logicalRef.current;

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [exportOpen]);

  const handleFit = useCallback(() => {
    activeRef()?.fit();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportPng = useCallback(async () => {
    setExportOpen(false);
    const blob = await activeRef()?.exportPng();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topology-${mode}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportSvg = useCallback(() => {
    setExportOpen(false);
    const svg = activeRef()?.exportSvg();
    if (!svg) {
      handleExportPng();
      return;
    }
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topology-${mode}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mode, handleExportPng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle helpers for logical filters
  function toggleDevice(id: string) {
    setHiddenDevices(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleHost(id: string) {
    setHiddenHosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleApp(id: string) {
    setHiddenApps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className={styles.page}>
      {devicesQ.error && <QueryErrorState error={devicesQ.error} onRetry={() => devicesQ.refetch()} />}
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.modeToggle}>
          <button
            className={mode === 'physical' ? styles.modePillActive : styles.modePill}
            onClick={() => setMode('physical')}
          >
            Physical
          </button>
          <button
            className={mode === 'logical' ? styles.modePillActive : styles.modePill}
            onClick={() => setMode('logical')}
          >
            Logical
          </button>
        </div>

        <div className={styles.headerActions}>
          <button className={styles.actionBtn} onClick={handleFit}>
            {mode === 'physical' ? 'Fit' : 'Top'}
          </button>
          <div className={styles.exportWrapper} ref={exportRef}>
            <button
              className={styles.actionBtn}
              onClick={() => setExportOpen(o => !o)}
            >
              Export
            </button>
            {exportOpen && (
              <div className={styles.exportDropdown}>
                <button className={styles.exportItem} onClick={handleExportSvg}>
                  Export SVG
                </button>
                <button className={styles.exportItem} onClick={handleExportPng}>
                  Export PNG
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* Left filter panel — swaps based on mode */}
        {mode === 'physical' ? (
          <TopologyFilterPanel
            siteId={siteId}
            rackFilter={rackFilter}
            onRackFilterChange={setRackFilter}
            switchFilter={switchFilter}
            onSwitchFilterChange={setSwitchFilter}
            vlanFilter={vlanFilter}
            onVlanFilterChange={setVlanFilter}
          />
        ) : (
          <LogicalFilterPanel
            devices={devices}
            hosts={hosts}
            apps={apps}
            containers={containers}
            hiddenDevices={hiddenDevices}
            hiddenHosts={hiddenHosts}
            hiddenApps={hiddenApps}
            onToggleDevice={toggleDevice}
            onToggleHost={toggleHost}
            onToggleApp={toggleApp}
          />
        )}

        {/* Canvas area — physical */}
        {mode === 'physical' && (
          <div className={styles.canvasArea}>
            <Suspense fallback={<div className={styles.comingSoon}>Loading topology...</div>}>
              <LazyPhysicalTopology
                ref={physicalRef}
                siteId={siteId}
                rackFilter={rackFilter}
                switchFilter={switchFilter}
                vlanFilter={vlanFilter}
                onNodeClick={handleNodeClick}
              />
            </Suspense>
          </div>
        )}

        {/* Canvas area — logical */}
        {mode === 'logical' && (
          <Suspense fallback={<div className={styles.comingSoon}>Loading stack view...</div>}>
            <LazyLogicalTopology
              ref={logicalRef}
              siteId={siteId}
              hiddenDevices={hiddenDevices}
              hiddenHosts={hiddenHosts}
              hiddenApps={hiddenApps}
              onNodeClick={handleNodeClick}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
