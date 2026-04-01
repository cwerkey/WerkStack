import { useState, useEffect, useCallback } from 'react';
import {
  useTrueNASConnect,
  useTrueNASCommit,
  useProxmoxConnect,
  useProxmoxCommit,
} from '@/api/platform-import';
import type {
  TrueNASPreview,
  TrueNASPool,
  TrueNASShare,
  TrueNASApp,
  ProxmoxPreview,
  ProxmoxVm,
  ProxmoxContainer,
  ProxmoxPool,
} from '@/api/platform-import';
import { api } from '@/utils/api';
import styles from './PlatformImportWizard.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlatformImportWizardProps {
  open:       boolean;
  siteId:     string;
  deviceId?:  string;
  onClose:    () => void;
  onImported: () => void;
}

type Platform = 'truenas' | 'proxmox';
type Step = 1 | 2 | 3;

interface DeviceOption {
  id:   string;
  name: string;
}

// ─── Shared Styles ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  color: '#d4d9dd',
  background: '#0e1012',
  border: '1px solid #2a3038',
  borderRadius: 4,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter,system-ui,sans-serif',
  fontSize: 11,
  color: '#8a9299',
  marginBottom: 4,
  display: 'block',
};

const btnPrimary: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  fontWeight: 500,
  background: '#c47c5a',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const btnGhost: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  background: 'none',
  color: '#8a9299',
  border: '1px solid #2a3038',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const monoStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  color: '#8a9299',
};

const errorBoxStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: '#2a1515',
  border: '1px solid #5a2020',
  borderRadius: 4,
  fontSize: 11,
  color: '#e08080',
  fontFamily: 'Inter,system-ui,sans-serif',
};

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepDot({ num, label, state }: { num: number; label: string; state: 'active' | 'done' | 'pending' }) {
  const color =
    state === 'active' ? '#c47c5a' :
    state === 'done'   ? '#3a8c4a' :
                         '#3a4248';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, fontWeight: 600,
        color: state === 'pending' ? '#8a9299' : '#fff',
      }}>
        {state === 'done' ? '\u2713' : num}
      </div>
      <span style={{
        fontFamily: 'Inter,system-ui,sans-serif', fontSize: 10,
        color: state === 'active' ? '#c47c5a' : state === 'done' ? '#3a8c4a' : '#5a6068',
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  selectedCount,
  expanded,
  onToggleExpand,
  onSelectAll,
  mapsTo,
  infoOnly,
}: {
  title: string;
  count: number;
  selectedCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectAll: () => void;
  mapsTo?: string;
  infoOnly?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: '#111417',
        borderBottom: '1px solid #2a3038',
        cursor: 'pointer',
      }}
      onClick={onToggleExpand}
    >
      <span style={{ fontSize: 10, color: '#5a6068', width: 12, textAlign: 'center' }}>
        {expanded ? '\u25BC' : '\u25B6'}
      </span>
      <span style={{
        fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, fontWeight: 600, color: '#d4d9dd',
      }}>
        {title}
      </span>
      <span style={{
        padding: '1px 6px', borderRadius: 8, background: '#2a3038',
        fontSize: 10, color: '#8a9299', fontFamily: 'Inter,system-ui,sans-serif',
      }}>
        {count}
      </span>
      {mapsTo && (
        <span style={{ ...monoStyle, fontSize: 9, color: '#5a6068' }}>
          {'\u2192'} {mapsTo}
        </span>
      )}
      {infoOnly && (
        <span style={{ ...monoStyle, fontSize: 9, color: '#5a6068', fontStyle: 'italic' }}>
          info only
        </span>
      )}
      <div style={{ flex: 1 }} />
      {!infoOnly && (
        <button
          style={{ ...btnGhost, padding: '2px 8px', fontSize: 9 }}
          onClick={e => { e.stopPropagation(); onSelectAll(); }}
        >
          {selectedCount === count ? 'Deselect all' : 'Select all'}
        </button>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (bytes == null || bytes === 0) return '-';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(1)} GB`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PlatformImportWizard({
  open,
  siteId,
  deviceId: preselectedDeviceId,
  onClose,
  onImported,
}: PlatformImportWizardProps) {
  // Step state
  const [step, setStep] = useState<Step>(1);

  // Step 1 form
  const [platform, setPlatform]     = useState<Platform>('truenas');
  const [apiUrl, setApiUrl]         = useState('');
  const [apiKey, setApiKey]         = useState('');
  const [tokenId, setTokenId]       = useState('');
  const [deviceId, setDeviceId]     = useState(preselectedDeviceId ?? '');
  const [devices, setDevices]       = useState<DeviceOption[]>([]);
  const [connectError, setConnectError] = useState('');

  // Step 2 — TrueNAS preview
  const [tnPreview, setTnPreview]   = useState<TrueNASPreview | null>(null);
  const [tnPools, setTnPools]       = useState<Set<number>>(new Set());
  const [tnShares, setTnShares]     = useState<Set<number>>(new Set());
  const [tnApps, setTnApps]         = useState<Set<number>>(new Set());

  // Step 2 — Proxmox preview
  const [pxPreview, setPxPreview]   = useState<ProxmoxPreview | null>(null);
  const [pxVms, setPxVms]           = useState<Set<number>>(new Set());
  const [pxCts, setPxCts]           = useState<Set<number>>(new Set());
  const [pxPools, setPxPools]       = useState<Set<number>>(new Set());

  // Section expansion
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});

  // Mutations
  const tnConnect = useTrueNASConnect(siteId);
  const tnCommit  = useTrueNASCommit(siteId);
  const pxConnect = useProxmoxConnect(siteId);
  const pxCommit  = useProxmoxCommit(siteId);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setPlatform('truenas');
      setApiUrl('');
      setApiKey('');
      setTokenId('');
      setDeviceId(preselectedDeviceId ?? '');
      setConnectError('');
      setTnPreview(null);
      setPxPreview(null);
      setTnPools(new Set());
      setTnShares(new Set());
      setTnApps(new Set());
      setPxVms(new Set());
      setPxCts(new Set());
      setPxPools(new Set());
      setExpanded({});
      tnConnect.reset();
      tnCommit.reset();
      pxConnect.reset();
      pxCommit.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch devices list
  useEffect(() => {
    if (open && siteId) {
      api.get<DeviceOption[]>(`/api/sites/${siteId}/devices`)
        .then(d => setDevices(d))
        .catch(() => setDevices([]));
    }
  }, [open, siteId]);

  // ─── Step 1: Connect ────────────────────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    setConnectError('');
    try {
      if (platform === 'truenas') {
        const preview = await tnConnect.mutateAsync({ apiUrl, apiKey, deviceId });
        setTnPreview(preview);
        setTnPools(new Set(preview.pools.map((_, i) => i)));
        setTnShares(new Set(preview.shares.map((_, i) => i)));
        setTnApps(new Set(preview.apps.map((_, i) => i)));
        setExpanded({ pools: true, shares: true, apps: true, interfaces: true });
      } else {
        const preview = await pxConnect.mutateAsync({ apiUrl, apiToken: apiKey, tokenId, deviceId });
        setPxPreview(preview);
        setPxVms(new Set(preview.vms.map((_, i) => i)));
        setPxCts(new Set(preview.containers.map((_, i) => i)));
        setPxPools(new Set(preview.pools.map((_, i) => i)));
        setExpanded({ vms: true, containers: true, pools: true, bridges: true });
      }
      setStep(2);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'connection failed');
    }
  }, [platform, apiUrl, apiKey, tokenId, deviceId, tnConnect, pxConnect]);

  // ─── Step 2: Toggle helpers ─────────────────────────────────────────────────

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<number>>>, idx: number) {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleAllSet(setter: React.Dispatch<React.SetStateAction<Set<number>>>, count: number, current: Set<number>) {
    if (current.size === count) {
      setter(new Set());
    } else {
      setter(new Set(Array.from({ length: count }, (_, i) => i)));
    }
  }

  function toggleExpand(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // ─── Step 3: Commit ─────────────────────────────────────────────────────────

  const selectedDeviceName = devices.find(d => d.id === deviceId)?.name ?? 'selected device';

  const getSummary = useCallback(() => {
    if (platform === 'truenas' && tnPreview) {
      return {
        items: [
          { label: 'pools', count: tnPools.size },
          { label: 'shares', count: tnShares.size },
          { label: 'apps', count: tnApps.size },
        ].filter(i => i.count > 0),
      };
    }
    if (platform === 'proxmox' && pxPreview) {
      return {
        items: [
          { label: 'VMs', count: pxVms.size },
          { label: 'containers', count: pxCts.size },
          { label: 'storage pools', count: pxPools.size },
        ].filter(i => i.count > 0),
      };
    }
    return { items: [] };
  }, [platform, tnPreview, pxPreview, tnPools, tnShares, tnApps, pxVms, pxCts, pxPools]);

  const handleImport = useCallback(async () => {
    try {
      if (platform === 'truenas' && tnPreview) {
        const selectedPools  = tnPreview.pools.filter((_, i) => tnPools.has(i));
        const selectedShares = tnPreview.shares.filter((_, i) => tnShares.has(i));
        const selectedApps   = tnPreview.apps.filter((_, i) => tnApps.has(i));
        await tnCommit.mutateAsync({
          deviceId,
          pools:  selectedPools,
          shares: selectedShares,
          apps:   selectedApps,
        });
      } else if (platform === 'proxmox' && pxPreview) {
        const selectedVms  = pxPreview.vms.filter((_, i) => pxVms.has(i));
        const selectedCts  = pxPreview.containers.filter((_, i) => pxCts.has(i));
        const selectedPls  = pxPreview.pools.filter((_, i) => pxPools.has(i));
        await pxCommit.mutateAsync({
          deviceId,
          vms:        selectedVms,
          containers: selectedCts,
          pools:      selectedPls,
        });
      }
      onImported();
      onClose();
    } catch {
      // error displayed via mutation state
    }
  }, [platform, deviceId, tnPreview, pxPreview, tnPools, tnShares, tnApps, pxVms, pxCts, pxPools, tnCommit, pxCommit, onImported, onClose]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!open) return null;

  const isConnecting = tnConnect.isPending || pxConnect.isPending;
  const isImporting  = tnCommit.isPending || pxCommit.isPending;
  const commitError  = tnCommit.error ?? pxCommit.error;

  const canConnect = apiUrl.trim().length > 0
    && apiKey.trim().length > 0
    && deviceId.length > 0
    && (platform !== 'proxmox' || tokenId.trim().length > 0)
    && !isConnecting;

  const summary = getSummary();
  const totalSelected = summary.items.reduce((s, i) => s + i.count, 0);

  const stepState = (n: number): 'active' | 'done' | 'pending' =>
    step === n ? 'active' : step > n ? 'done' : 'pending';

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontFamily: 'Inter,system-ui,sans-serif', fontSize: 15, fontWeight: 600, color: '#d4d9dd',
          }}>
            Platform Import
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#5a6068', fontSize: 18, lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: 8 }}>
          <StepDot num={1} label="Connect" state={stepState(1)} />
          <StepDot num={2} label="Preview" state={stepState(2)} />
          <StepDot num={3} label="Import"  state={stepState(3)} />
        </div>

        {/* ── Step 1: Source Selection ──────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Platform radio */}
            <div>
              <label style={labelStyle}>Platform</label>
              <div style={{ display: 'flex', gap: 16 }}>
                {(['truenas', 'proxmox'] as Platform[]).map(p => (
                  <label key={p} style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, color: '#d4d9dd',
                  }}>
                    <input
                      type="radio"
                      name="platform"
                      value={p}
                      checked={platform === p}
                      onChange={() => setPlatform(p)}
                      style={{ accentColor: '#c47c5a' }}
                    />
                    {p === 'truenas' ? 'TrueNAS SCALE' : 'Proxmox VE'}
                  </label>
                ))}
              </div>
            </div>

            {/* API URL */}
            <div>
              <label style={labelStyle}>API URL</label>
              <input
                style={inputStyle}
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder={platform === 'truenas'
                  ? 'https://truenas.local'
                  : 'https://proxmox.local:8006'}
                autoFocus
              />
            </div>

            {/* API Key */}
            <div>
              <label style={labelStyle}>
                {platform === 'truenas' ? 'API Key' : 'API Token Secret'}
              </label>
              <input
                type="password"
                style={inputStyle}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={platform === 'truenas'
                  ? 'Paste TrueNAS API key'
                  : 'Paste Proxmox API token secret'}
              />
            </div>

            {/* Proxmox Token ID */}
            {platform === 'proxmox' && (
              <div>
                <label style={labelStyle}>Token ID</label>
                <input
                  style={inputStyle}
                  value={tokenId}
                  onChange={e => setTokenId(e.target.value)}
                  placeholder="user@realm!tokenname"
                />
              </div>
            )}

            {/* Device dropdown */}
            <div>
              <label style={labelStyle}>Map to Device</label>
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={deviceId}
                onChange={e => setDeviceId(e.target.value)}
              >
                <option value="">Select a device...</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Error */}
            {connectError && <div style={errorBoxStyle}>{connectError}</div>}
          </div>
        )}

        {/* ── Step 2: Preview ──────────────────────────────────────────── */}
        {step === 2 && platform === 'truenas' && tnPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #2a3038', borderRadius: 4, overflow: 'hidden' }}>
            {/* Pools */}
            <SectionHeader
              title="Pools"
              count={tnPreview.pools.length}
              selectedCount={tnPools.size}
              expanded={!!expanded.pools}
              onToggleExpand={() => toggleExpand('pools')}
              onSelectAll={() => toggleAllSet(setTnPools, tnPreview.pools.length, tnPools)}
              mapsTo="storage_pool"
            />
            {expanded.pools && tnPreview.pools.map((pool, i) => (
              <div
                key={i}
                className={styles.itemRow}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderBottom: '1px solid #1e2428',
                  cursor: 'pointer',
                  background: tnPools.has(i) ? 'transparent' : '#0e1012',
                  opacity: tnPools.has(i) ? 1 : 0.5,
                }}
                onClick={() => toggleSet(setTnPools, i)}
              >
                <input type="checkbox" checked={tnPools.has(i)} onChange={() => toggleSet(setTnPools, i)} style={{ accentColor: '#c47c5a', cursor: 'pointer' }} />
                <span style={{ fontSize: 11, color: '#d4d9dd', fontWeight: 500 }}>{pool.name}</span>
                <span style={monoStyle}>zfs</span>
                <span style={monoStyle}>{pool.status ?? '-'}</span>
              </div>
            ))}

            {/* Shares */}
            <SectionHeader
              title="Shares"
              count={tnPreview.shares.length}
              selectedCount={tnShares.size}
              expanded={!!expanded.shares}
              onToggleExpand={() => toggleExpand('shares')}
              onSelectAll={() => toggleAllSet(setTnShares, tnPreview.shares.length, tnShares)}
              mapsTo="share"
            />
            {expanded.shares && tnPreview.shares.map((share, i) => (
              <div
                key={i}
                className={styles.itemRow}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderBottom: '1px solid #1e2428',
                  cursor: 'pointer',
                  background: tnShares.has(i) ? 'transparent' : '#0e1012',
                  opacity: tnShares.has(i) ? 1 : 0.5,
                }}
                onClick={() => toggleSet(setTnShares, i)}
              >
                <input type="checkbox" checked={tnShares.has(i)} onChange={() => toggleSet(setTnShares, i)} style={{ accentColor: '#c47c5a', cursor: 'pointer' }} />
                <span style={{ fontSize: 11, color: '#d4d9dd', fontWeight: 500 }}>{share.name}</span>
                <span style={monoStyle}>{share.protocol}</span>
                <span style={{ ...monoStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{share.path || '-'}</span>
              </div>
            ))}

            {/* Apps */}
            <SectionHeader
              title="Apps"
              count={tnPreview.apps.length}
              selectedCount={tnApps.size}
              expanded={!!expanded.apps}
              onToggleExpand={() => toggleExpand('apps')}
              onSelectAll={() => toggleAllSet(setTnApps, tnPreview.apps.length, tnApps)}
              mapsTo="container"
            />
            {expanded.apps && tnPreview.apps.map((app, i) => (
              <div
                key={i}
                className={styles.itemRow}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderBottom: '1px solid #1e2428',
                  cursor: 'pointer',
                  background: tnApps.has(i) ? 'transparent' : '#0e1012',
                  opacity: tnApps.has(i) ? 1 : 0.5,
                }}
                onClick={() => toggleSet(setTnApps, i)}
              >
                <input type="checkbox" checked={tnApps.has(i)} onChange={() => toggleSet(setTnApps, i)} style={{ accentColor: '#c47c5a', cursor: 'pointer' }} />
                <span style={{ fontSize: 11, color: '#d4d9dd', fontWeight: 500 }}>{app.name}</span>
                <span style={monoStyle}>{app.state ?? 'unknown'}</span>
              </div>
            ))}

            {/* Interfaces (info only) */}
            <SectionHeader
              title="Interfaces"
              count={tnPreview.interfaces.length}
              selectedCount={0}
              expanded={!!expanded.interfaces}
              onToggleExpand={() => toggleExpand('interfaces')}
              onSelectAll={() => {}}
              infoOnly
            />
            {expanded.interfaces && tnPreview.interfaces.map((iface, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderBottom: '1px solid #1e2428',
                  opacity: 0.6,
                }}
              >
                <span style={{ width: 20 }} />
                <span style={{ fontSize: 11, color: '#d4d9dd' }}>{iface.name}</span>
                <span style={monoStyle}>
                  {iface.aliases.map(a => `${a.address}/${a.netmask}`).join(', ') || '-'}
                </span>
                <span style={monoStyle}>{iface.state}</span>
              </div>
            ))}
          </div>
        )}

        {step === 2 && platform === 'proxmox' && pxPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #2a3038', borderRadius: 4, overflow: 'hidden' }}>
            {/* VMs */}
            <SectionHeader
              title="Virtual Machines"
              count={pxPreview.vms.length}
              selectedCount={pxVms.size}
              expanded={!!expanded.vms}
              onToggleExpand={() => toggleExpand('vms')}
              onSelectAll={() => toggleAllSet(setPxVms, pxPreview.vms.length, pxVms)}
              mapsTo="os_vm"
            />
            {expanded.vms && pxPreview.vms.map((vm, i) => (
              <div
                key={i}
                className={styles.itemRow}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderBottom: '1px solid #1e2428',
                  cursor: 'pointer',
                  background: pxVms.has(i) ? 'transparent' : '#0e1012',
                  opacity: pxVms.has(i) ? 1 : 0.5,
                }}
                onClick={() => toggleSet(setPxVms, i)}
              >
                <input type="checkbox" checked={pxVms.has(i)} onChange={() => toggleSet(setPxVms, i)} style={{ accentColor: '#c47c5a', cursor: 'pointer' }} />
                <span style={{ fontSize: 11, color: '#d4d9dd', fontWeight: 500, minWidth: 140 }}>{vm.name}</span>
                <span style={monoStyle}>VMID {vm.vmid ?? '-'}</span>
                <span style={monoStyle}>{vm.cores ?? '-'} cores</span>
                <span style={monoStyle}>{formatBytes(vm.memory)} RAM</span>
                <span style={monoStyle}>{vm.status ?? '-'}</span>
              </div>
            ))}

            {/* LXC Containers */}
            <SectionHeader
              title="Containers"
              count={pxPreview.containers.length}
              selectedCount={pxCts.size}
              expanded={!!expanded.containers}
              onToggleExpand={() => toggleExpand('containers')}
              onSelectAll={() => toggleAllSet(setPxCts, pxPreview.containers.length, pxCts)}
              mapsTo="os_vm (lxc)"
            />
            {expanded.containers && pxPreview.containers.map((ct, i) => (
              <div
                key={i}
                className={styles.itemRow}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderBottom: '1px solid #1e2428',
                  cursor: 'pointer',
                  background: pxCts.has(i) ? 'transparent' : '#0e1012',
                  opacity: pxCts.has(i) ? 1 : 0.5,
                }}
                onClick={() => toggleSet(setPxCts, i)}
              >
                <input type="checkbox" checked={pxCts.has(i)} onChange={() => toggleSet(setPxCts, i)} style={{ accentColor: '#c47c5a', cursor: 'pointer' }} />
                <span style={{ fontSize: 11, color: '#d4d9dd', fontWeight: 500, minWidth: 140 }}>{ct.name}</span>
                <span style={monoStyle}>CTID {ct.vmid ?? '-'}</span>
                <span style={monoStyle}>{ct.cores ?? '-'} cores</span>
                <span style={monoStyle}>{formatBytes(ct.memory)} RAM</span>
                <span style={monoStyle}>{ct.status ?? '-'}</span>
              </div>
            ))}

            {/* Storage Pools */}
            <SectionHeader
              title="Storage Pools"
              count={pxPreview.pools.length}
              selectedCount={pxPools.size}
              expanded={!!expanded.pools}
              onToggleExpand={() => toggleExpand('pools')}
              onSelectAll={() => toggleAllSet(setPxPools, pxPreview.pools.length, pxPools)}
              mapsTo="storage_pool"
            />
            {expanded.pools && pxPreview.pools.map((pool, i) => (
              <div
                key={i}
                className={styles.itemRow}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderBottom: '1px solid #1e2428',
                  cursor: 'pointer',
                  background: pxPools.has(i) ? 'transparent' : '#0e1012',
                  opacity: pxPools.has(i) ? 1 : 0.5,
                }}
                onClick={() => toggleSet(setPxPools, i)}
              >
                <input type="checkbox" checked={pxPools.has(i)} onChange={() => toggleSet(setPxPools, i)} style={{ accentColor: '#c47c5a', cursor: 'pointer' }} />
                <span style={{ fontSize: 11, color: '#d4d9dd', fontWeight: 500, minWidth: 120 }}>{pool.storage}</span>
                <span style={monoStyle}>{pool.type ?? '-'}</span>
                <span style={monoStyle}>{formatBytes(pool.total)} total</span>
                <span style={monoStyle}>{formatBytes(pool.used)} used</span>
              </div>
            ))}

            {/* Bridges (info only) */}
            <SectionHeader
              title="Bridges"
              count={pxPreview.bridges.length}
              selectedCount={0}
              expanded={!!expanded.bridges}
              onToggleExpand={() => toggleExpand('bridges')}
              onSelectAll={() => {}}
              infoOnly
            />
            {expanded.bridges && pxPreview.bridges.map((br, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderBottom: '1px solid #1e2428',
                  opacity: 0.6,
                }}
              >
                <span style={{ width: 20 }} />
                <span style={{ fontSize: 11, color: '#d4d9dd' }}>{br.iface}</span>
                <span style={monoStyle}>{br.type}</span>
                <span style={monoStyle}>{br.address ?? '-'}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 3: Confirm ──────────────────────────────────────────── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              padding: '12px 14px',
              background: '#111417',
              border: '1px solid #2a3038',
              borderRadius: 4,
              fontFamily: 'Inter,system-ui,sans-serif',
              fontSize: 12,
              color: '#d4d9dd',
              lineHeight: 1.6,
            }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>
                The following records will be created on {selectedDeviceName}:
              </p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {summary.items.map(item => (
                  <li key={item.label}>{item.count} {item.label}</li>
                ))}
              </ul>
              {platform === 'truenas' && (
                <p style={{ margin: '8px 0 0 0', ...monoStyle, fontSize: 10 }}>
                  An os_host record for TrueNAS SCALE will be created or updated.
                </p>
              )}
              {platform === 'proxmox' && (
                <p style={{ margin: '8px 0 0 0', ...monoStyle, fontSize: 10 }}>
                  An os_host record for Proxmox VE will be created or updated.
                </p>
              )}
            </div>

            {commitError && (
              <div style={errorBoxStyle}>
                {commitError instanceof Error ? commitError.message : 'import failed'}
              </div>
            )}
          </div>
        )}

        {/* ── Navigation buttons ──────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          {step > 1 && (
            <button style={btnGhost} onClick={() => setStep((step - 1) as Step)}>
              Back
            </button>
          )}
          {step === 1 && (
            <button
              style={{ ...btnPrimary, opacity: canConnect ? 1 : 0.4 }}
              disabled={!canConnect}
              onClick={handleConnect}
            >
              {isConnecting ? 'Connecting...' : 'Connect & Fetch'}
            </button>
          )}
          {step === 2 && (
            <button
              style={{ ...btnPrimary, opacity: totalSelected > 0 ? 1 : 0.4 }}
              disabled={totalSelected === 0}
              onClick={() => setStep(3)}
            >
              Review ({totalSelected} item{totalSelected !== 1 ? 's' : ''})
            </button>
          )}
          {step === 3 && (
            <button
              style={{ ...btnPrimary, opacity: totalSelected > 0 && !isImporting ? 1 : 0.4 }}
              disabled={totalSelected === 0 || isImporting}
              onClick={handleImport}
            >
              {isImporting ? 'Importing...' : 'Import Selected'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
