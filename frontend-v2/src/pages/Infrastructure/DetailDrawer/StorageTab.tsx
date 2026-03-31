import { useState, useMemo } from 'react';
import type {
  DeviceInstance,
  DeviceTemplate,
  Drive,
  ExternalDrive,
  StoragePool,
  Share,
  PlacedBlock,
} from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import styles from './StorageTab.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StorageTabProps {
  device:           DeviceInstance;
  template?:        DeviceTemplate;
  drives:           Drive[];           // all site drives (filter to device locally)
  externalDrives:   ExternalDrive[];   // drives from connected JBODs/DAS
  pools:            StoragePool[];     // all site pools (filter to device locally)
  shares:           Share[];           // all site shares (filter to device pools locally)
  onCreatePool:     () => void;
  onConnectExternal:() => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DRIVE_TYPE_COLORS: Record<string, string> = {
  hdd:   '#4a6a8a',
  ssd:   '#6a8a4a',
  nvme:  '#8a6a8a',
  flash: '#8a8a4a',
  tape:  '#6a6a6a',
};

function driveTypeColor(dt: string): string {
  return DRIVE_TYPE_COLORS[dt] ?? '#5a6068';
}

function hasPcieSlots(template?: DeviceTemplate): boolean {
  if (!template) return false;
  const allBlocks: PlacedBlock[] = [
    ...(template.layout?.front ?? []),
    ...(template.layout?.rear ?? []),
  ];
  return allBlocks.some(b => b.type.startsWith('pcie-'));
}

function hasBaySlots(template?: DeviceTemplate): boolean {
  if (!template) return false;
  const allBlocks: PlacedBlock[] = [
    ...(template.layout?.front ?? []),
    ...(template.layout?.rear ?? []),
  ];
  return allBlocks.some(b => {
    const def = BLOCK_DEF_MAP.get(b.type);
    return def?.isSlot && b.type.startsWith('bay-');
  });
}

function getBayLabel(slotBlockId: string | undefined, template?: DeviceTemplate): string {
  if (!slotBlockId || !template) return '';
  const allBlocks: PlacedBlock[] = [
    ...(template.layout?.front ?? []),
    ...(template.layout?.rear ?? []),
  ];
  const block = allBlocks.find(b => b.id === slotBlockId);
  if (!block) return '';
  const def = BLOCK_DEF_MAP.get(block.type);
  return block.label || def?.label || block.type;
}

function poolDriveCount(pool: StoragePool, drives: Drive[]): number {
  return drives.filter(d => d.poolId === pool.id).length;
}

const HEALTH_COLORS: Record<string, string> = {
  online:   '#3a8c4a',
  degraded: '#c4a43a',
  faulted:  '#e8615a',
  offline:  '#5a6068',
  unknown:  '#3a4248',
};

const HEALTH_LABELS: Record<string, string> = {
  online:   'Online',
  degraded: 'Degraded',
  faulted:  'Faulted',
  offline:  'Offline',
  unknown:  'Unknown',
};

function formatVdevType(t: string): string {
  const labels: Record<string, string> = {
    mirror: 'mirror',
    raidz1: 'RAIDZ1',
    raidz2: 'RAIDZ2',
    raidz3: 'RAIDZ3',
    stripe: 'stripe',
    special: 'special',
    log:    'log',
    cache:  'cache',
    spare:  'spare',
  };
  return labels[t] ?? t;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function StorageTab({
  device,
  template,
  drives,
  externalDrives,
  pools,
  shares,
  onCreatePool,
  onConnectExternal,
}: StorageTabProps) {
  const [expandedPoolId, setExpandedPoolId] = useState<string | null>(null);

  // ── Filter data to this device ──────────────────────────────────────────

  const localDrives = useMemo(
    () => drives.filter(d => d.deviceId === device.id),
    [drives, device.id],
  );

  const devicePools = useMemo(
    () => pools.filter(p => p.deviceId === device.id),
    [pools, device.id],
  );

  const allDeviceDrives = useMemo(
    () => [...localDrives, ...externalDrives],
    [localDrives, externalDrives],
  );

  const poolShares = useMemo(() => {
    const poolIds = new Set(devicePools.map(p => p.id));
    return shares.filter(s => s.poolId && poolIds.has(s.poolId));
  }, [shares, devicePools]);

  // ── Group external drives by source device ──────────────────────────────

  const externalGroups = useMemo(() => {
    const groups: Record<string, ExternalDrive[]> = {};
    for (const d of externalDrives) {
      const key = d.sourceDeviceName;
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    }
    return groups;
  }, [externalDrives]);

  const showExternalPrompt =
    externalDrives.length === 0 && hasPcieSlots(template);

  // ── Pool click handler ──────────────────────────────────────────────────

  function handlePoolClick(poolId: string) {
    setExpandedPoolId(prev => (prev === poolId ? null : poolId));
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.tab}>

      {/* ── Drives Section ─────────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            Drives ({localDrives.length + externalDrives.length})
          </span>
          {hasBaySlots(template) && (
            <button className={styles.addBtn}>+ Add Drive</button>
          )}
        </div>

        {/* Local drives */}
        {localDrives.length === 0 && externalDrives.length === 0 && (
          <p className={styles.empty}>No drives installed</p>
        )}

        {localDrives.map(drive => (
          <DriveRow
            key={drive.id}
            drive={drive}
            template={template}
            pools={devicePools}
          />
        ))}

        {/* External drives grouped by source */}
        {Object.entries(externalGroups).map(([sourceName, groupDrives]) => (
          <div key={sourceName} className={styles.sourceGroup}>
            <span className={styles.sourceLabel}>{sourceName}</span>
            {groupDrives.map(drive => (
              <DriveRow
                key={drive.id}
                drive={drive}
                template={undefined}
                pools={devicePools}
                isExternal
              />
            ))}
          </div>
        ))}

        {/* External storage prompt */}
        {showExternalPrompt && (
          <div className={styles.promptBanner} onClick={onConnectExternal}>
            Connect external storage
            <span className={styles.promptArrow}>&rarr;</span>
          </div>
        )}
      </div>

      {/* ── Pools Section ──────────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            Pools ({devicePools.length})
          </span>
          <button className={styles.addBtn} onClick={onCreatePool}>
            + Create Pool
          </button>
        </div>

        {devicePools.length === 0 && (
          <p className={styles.empty}>No pools configured</p>
        )}

        {devicePools.map(pool => (
          <div key={pool.id}>
            <PoolRow
              pool={pool}
              driveCount={poolDriveCount(pool, allDeviceDrives)}
              expanded={expandedPoolId === pool.id}
              onClick={() => handlePoolClick(pool.id)}
            />
            {expandedPoolId === pool.id && (
              <PoolDetail
                pool={pool}
                drives={allDeviceDrives}
                shares={shares}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Shares Section ─────────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            Shares ({poolShares.length})
          </span>
        </div>

        {poolShares.length === 0 && (
          <p className={styles.empty}>No shares configured</p>
        )}

        {poolShares.map(share => (
          <ShareRow key={share.id} share={share} pools={devicePools} />
        ))}
      </div>
    </div>
  );
}

// ─── Drive Row ───────────────────────────────────────────────────────────────

interface DriveRowProps {
  drive:      Drive;
  template?:  DeviceTemplate;
  pools:      StoragePool[];
  isExternal?: boolean;
}

function DriveRow({ drive, template, pools, isExternal }: DriveRowProps) {
  const pool = pools.find(p => p.id === drive.poolId);
  const bayLabel = getBayLabel(drive.slotBlockId, template);

  return (
    <div className={styles.driveRow}>
      <div
        className={styles.driveIcon}
        style={{ background: driveTypeColor(drive.driveType) }}
      >
        {drive.driveType === 'hdd' ? 'H' :
         drive.driveType === 'ssd' ? 'S' :
         drive.driveType === 'nvme' ? 'N' :
         drive.driveType === 'flash' ? 'F' :
         drive.driveType === 'tape' ? 'T' : '?'}
      </div>
      <span className={styles.driveLabel}>
        {drive.model || drive.label || drive.serial || drive.driveType.toUpperCase()}
      </span>
      <span className={styles.driveCapacity}>{drive.capacity}</span>
      <span className={styles.driveType}>{drive.driveType}</span>
      {bayLabel && <span className={styles.driveBay}>{bayLabel}</span>}
      {pool && <span className={styles.drivePool}>{pool.name}</span>}
      {isExternal && <span className={styles.externalBadge}>External</span>}
      {drive.isBoot && <span className={styles.bootBadge}>Boot</span>}
    </div>
  );
}

// ─── Pool Row ────────────────────────────────────────────────────────────────

interface PoolRowProps {
  pool:       StoragePool;
  driveCount: number;
  expanded:   boolean;
  onClick:    () => void;
}

function PoolRow({ pool, driveCount, expanded, onClick }: PoolRowProps) {
  const layoutLabel =
    pool.poolType === 'zfs'
      ? pool.vdevGroups.length > 0
        ? pool.vdevGroups.map(v => formatVdevType(v.type)).join(' + ')
        : pool.raidLevel
      : pool.raidLevel;

  // Capacity bar: use drive count as rough proxy (no capacity sum in pool model)
  const capacityPct = driveCount > 0 ? Math.min(100, driveCount * 15) : 0;

  return (
    <div className={styles.poolRow} onClick={onClick}>
      <div
        className={styles.poolHealthDot}
        style={{ background: HEALTH_COLORS[pool.health] ?? '#3a4248' }}
        title={HEALTH_LABELS[pool.health] ?? 'Unknown'}
      />
      <div className={styles.poolColor} style={{ background: pool.color }} />
      <span className={styles.poolName}>{pool.name}</span>
      <span className={styles.poolType}>{pool.poolType}</span>
      <span className={styles.poolLayout}>{layoutLabel}</span>
      <div className={styles.poolCapacityBar}>
        <div
          className={styles.poolCapacityFill}
          style={{ width: `${capacityPct}%`, background: pool.color }}
        />
      </div>
      <span style={{ fontSize: 10, color: '#5a6068' }}>
        {driveCount}d
      </span>
      <span style={{ fontSize: 9, color: '#5a6068' }}>
        {expanded ? '▾' : '▸'}
      </span>
    </div>
  );
}

// ─── Pool Detail (expanded) ──────────────────────────────────────────────────

interface PoolDetailProps {
  pool:   StoragePool;
  drives: Drive[];
  shares: Share[];
}

function PoolDetail({ pool, drives, shares }: PoolDetailProps) {
  const poolDrives = drives.filter(d => d.poolId === pool.id);
  const poolShares = shares.filter(s => s.poolId === pool.id);
  const driveLookup = new Map(drives.map(d => [d.id, d]));

  return (
    <div className={styles.poolDetail}>
      {/* Vdev layout */}
      {pool.vdevGroups.length > 0 && (
        <>
          <span className={styles.poolDetailTitle}>vdev layout</span>
          {pool.vdevGroups.map(vdev => (
            <div key={vdev.id} className={styles.vdevBlock}>
              <span className={styles.vdevLabel}>
                {vdev.label || formatVdevType(vdev.type)} ({vdev.driveIds.length} drives)
              </span>
              {vdev.driveIds.map(did => {
                const drive = driveLookup.get(did);
                return (
                  <span key={did} className={styles.vdevDrive}>
                    {drive
                      ? `${drive.label || drive.serial || drive.driveType} ${drive.capacity}`
                      : did}
                  </span>
                );
              })}
            </div>
          ))}
        </>
      )}

      {/* Drive assignments (flat list for non-vdev pools) */}
      {pool.vdevGroups.length === 0 && poolDrives.length > 0 && (
        <>
          <span className={styles.poolDetailTitle}>drives</span>
          {poolDrives.map(d => (
            <span key={d.id} className={styles.vdevDrive}>
              {d.label || d.serial || d.driveType} {d.capacity}
            </span>
          ))}
        </>
      )}

      {/* Shares */}
      {poolShares.length > 0 && (
        <>
          <span className={styles.poolDetailTitle}>shares</span>
          {poolShares.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className={`${styles.protocolBadge} ${
                s.protocol === 'smb' ? styles.protocolSmb :
                s.protocol === 'nfs' ? styles.protocolNfs :
                styles.protocolIscsi
              }`}>
                {s.protocol}
              </span>
              <span style={{ fontSize: 10, color: '#d4d9dd' }}>{s.name}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Share Row ───────────────────────────────────────────────────────────────

interface ShareRowProps {
  share: Share;
  pools: StoragePool[];
}

function ShareRow({ share, pools }: ShareRowProps) {
  const pool = pools.find(p => p.id === share.poolId);

  return (
    <div className={styles.shareRow}>
      <span className={`${styles.protocolBadge} ${
        share.protocol === 'smb' ? styles.protocolSmb :
        share.protocol === 'nfs' ? styles.protocolNfs :
        styles.protocolIscsi
      }`}>
        {share.protocol}
      </span>
      <span className={styles.shareName}>{share.name}</span>
      {share.path && <span className={styles.sharePath}>{share.path}</span>}
      <span className={styles.accessBadge}>{share.accessMode}</span>
      {pool && <span className={styles.drivePool}>{pool.name}</span>}
    </div>
  );
}
