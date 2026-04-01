import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSiteStore } from '@/stores/siteStore';
import { useGetDevices } from '@/api/devices';
import { useGetRacks } from '@/api/racks';
import { TopologyFilterPanel } from './TopologyFilterPanel';
import type { PhysicalTopologyHandle } from './PhysicalTopology';
import styles from './TopologyPage.module.css';

type Mode = 'physical' | 'logical';

// Lazy load PhysicalTopology
const LazyPhysicalTopology = lazy(() => import('./PhysicalTopology'));

export default function TopologyPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';
  const navigate = useNavigate();
  const { data: devices = [] } = useGetDevices(siteId);
  const { data: racks = [] } = useGetRacks(siteId);

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
  const topoRef = useRef<PhysicalTopologyHandle>(null);

  // Filter state
  const [rackFilter, setRackFilter] = useState<Set<string> | null>(null);
  const [switchFilter, setSwitchFilter] = useState<string | null>(null);
  const [vlanFilter, setVlanFilter] = useState<Set<number> | null>(null);

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
    topoRef.current?.fit();
  }, []);

  const handleExportPng = useCallback(async () => {
    setExportOpen(false);
    const blob = await topoRef.current?.exportPng();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'topology.png';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportSvg = useCallback(() => {
    setExportOpen(false);
    const svg = topoRef.current?.exportSvg();
    if (!svg) {
      // Fall back to PNG if SVG not available
      handleExportPng();
      return;
    }
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'topology.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [handleExportPng]);

  return (
    <div className={styles.page}>
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
            Fit
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
        {mode === 'physical' && (
          <TopologyFilterPanel
            siteId={siteId}
            rackFilter={rackFilter}
            onRackFilterChange={setRackFilter}
            switchFilter={switchFilter}
            onSwitchFilterChange={setSwitchFilter}
            vlanFilter={vlanFilter}
            onVlanFilterChange={setVlanFilter}
          />
        )}

        {mode === 'physical' ? (
          <div className={styles.canvasArea}>
            <Suspense fallback={<div className={styles.comingSoon}>Loading topology...</div>}>
              <LazyPhysicalTopology
                ref={topoRef}
                siteId={siteId}
                rackFilter={rackFilter}
                switchFilter={switchFilter}
                vlanFilter={vlanFilter}
                onNodeClick={handleNodeClick}
              />
            </Suspense>
          </div>
        ) : (
          <div className={styles.comingSoon}>
            Logical topology — coming soon
          </div>
        )}
      </div>
    </div>
  );
}
