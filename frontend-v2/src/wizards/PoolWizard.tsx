import { useState, useEffect, useMemo } from 'react';
import type {
  Drive,
  ExternalDrive,
  StoragePool,
  PoolType,
  VdevGroup,
  VdevType,
  DriveInterfaceType,
} from '@werkstack/shared';
import { useCreateDrive } from '@/api/storage';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PoolWizardProps {
  open:              boolean;
  siteId:            string;
  deviceId:          string;
  localDrives:       Drive[];
  externalDrives:    ExternalDrive[];
  onSubmit:          (pool: Omit<StoragePool, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => void;
  onConnectExternal: () => void;
  onClose:           () => void;
}

// ─── Shared styles ───────────────────────────────────────────────────────────

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

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
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

// ─── Step indicator ──────────────────────────────────────────────────────────

interface StepDotProps {
  num: number;
  label: string;
  state: 'active' | 'done' | 'pending';
}

function StepDot({ num, label, state }: StepDotProps) {
  const color =
    state === 'active'  ? '#c47c5a' :
    state === 'done'    ? '#3a8c4a' :
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
        {state === 'done' ? '✓' : num}
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

// ─── Pool type options ───────────────────────────────────────────────────────

const POOL_TYPES: { value: PoolType; label: string }[] = [
  { value: 'zfs',  label: 'ZFS' },
  { value: 'raid', label: 'RAID' },
  { value: 'lvm',  label: 'LVM' },
  { value: 'ceph', label: 'Ceph' },
  { value: 'drive', label: 'Unraid' },
];

const ZFS_VDEV_TYPES: { value: VdevType; label: string; minDrives: number }[] = [
  { value: 'mirror', label: 'Mirror',  minDrives: 2 },
  { value: 'raidz1', label: 'RAIDZ1',  minDrives: 3 },
  { value: 'raidz2', label: 'RAIDZ2',  minDrives: 4 },
  { value: 'raidz3', label: 'RAIDZ3',  minDrives: 5 },
  { value: 'stripe', label: 'Stripe',  minDrives: 1 },
];

const RAID_LEVELS: { value: string; label: string; minDrives: number }[] = [
  { value: 'raid0',  label: 'RAID 0 (Stripe)',  minDrives: 2 },
  { value: 'raid1',  label: 'RAID 1 (Mirror)',  minDrives: 2 },
  { value: 'raid5',  label: 'RAID 5',           minDrives: 3 },
  { value: 'raid6',  label: 'RAID 6',           minDrives: 4 },
  { value: 'raid10', label: 'RAID 10',          minDrives: 4 },
];

// ─── Main component ──────────────────────────────────────────────────────────

export function PoolWizard({
  open,
  siteId,
  deviceId,
  localDrives,
  externalDrives,
  onSubmit,
  onConnectExternal,
  onClose,
}: PoolWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 state
  const [poolName, setPoolName]     = useState('');
  const [poolType, setPoolType]     = useState<PoolType>('zfs');

  // Step 2 state
  const [selectedDriveIds, setSelectedDriveIds] = useState<Set<string>>(new Set());

  // Step 2 inline create state
  const [showCreateDrive, setShowCreateDrive] = useState(false);
  const [newDrive, setNewDrive] = useState({
    label: '',
    driveType: 'ssd' as 'hdd' | 'ssd' | 'nvme' | 'flash' | 'tape',
    capacity: '',
    interfaceType: '' as DriveInterfaceType | '',
  });

  // Step 3 state (ZFS)
  const [vdevType, setVdevType]       = useState<VdevType>('mirror');
  const [vdevGroups, setVdevGroups]   = useState<VdevGroup[]>([]);
  // Step 3 state (RAID)
  const [raidLevel, setRaidLevel]     = useState('raid5');

  const createDrive = useCreateDrive(siteId);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setPoolName('');
      setPoolType('zfs');
      setSelectedDriveIds(new Set());
      setShowCreateDrive(false);
      setNewDrive({ label: '', driveType: 'ssd', capacity: '', interfaceType: '' });
      setVdevType('mirror');
      setVdevGroups([]);
      setRaidLevel('raid5');
    }
  }, [open]);

  // All available drives for this pool
  const allDrives = useMemo(() => {
    const unassignedLocal = localDrives.filter(d => d.deviceId === deviceId && !d.poolId);
    const unassignedExternal = externalDrives.filter(d => !d.poolId);
    return [...unassignedLocal, ...unassignedExternal];
  }, [localDrives, externalDrives, deviceId]);

  const selectedDrives = useMemo(
    () => allDrives.filter(d => selectedDriveIds.has(d.id)),
    [allDrives, selectedDriveIds],
  );

  // ── Drive selection ─────────────────────────────────────────────────────

  function toggleDrive(driveId: string) {
    setSelectedDriveIds(prev => {
      const next = new Set(prev);
      if (next.has(driveId)) next.delete(driveId);
      else next.add(driveId);
      return next;
    });
  }

  // ── Inline drive creation ────────────────────────────────────────────────

  function handleCreateDrive() {
    if (!newDrive.capacity.trim()) return;
    createDrive.mutate(
      {
        deviceId,
        label: newDrive.label || undefined,
        driveType: newDrive.driveType,
        capacity: newDrive.capacity,
        interfaceType: newDrive.interfaceType || undefined,
        isBoot: false,
      },
      {
        onSuccess: (drive) => {
          setSelectedDriveIds(prev => new Set([...prev, drive.id]));
          setShowCreateDrive(false);
          setNewDrive({ label: '', driveType: 'ssd', capacity: '', interfaceType: '' });
        },
      },
    );
  }

  // ── Advance to step 3: seed initial vdev group ──────────────────────────

  function advanceToStep3() {
    if (poolType === 'zfs' && vdevGroups.length === 0) {
      // Seed with one vdev containing all selected drives
      setVdevGroups([{
        id: crypto.randomUUID(),
        type: vdevType,
        driveIds: Array.from(selectedDriveIds),
      }]);
    }
    setStep(3);
  }

  // ── ZFS multi-vdev management ──────────────────────────────────────────

  function addVdevGroup() {
    setVdevGroups(prev => [...prev, {
      id: crypto.randomUUID(),
      type: vdevType,
      driveIds: [],
    }]);
  }

  function removeVdevGroup(vdevId: string) {
    setVdevGroups(prev => prev.filter(v => v.id !== vdevId));
  }

  function setVdevGroupType(vdevId: string, newType: VdevType) {
    setVdevGroups(prev => prev.map(v =>
      v.id === vdevId ? { ...v, type: newType } : v
    ));
  }

  function toggleDriveInVdev(vdevId: string, driveId: string) {
    setVdevGroups(prev => prev.map(v => {
      if (v.id !== vdevId) {
        // Remove from other vdevs if present
        return { ...v, driveIds: v.driveIds.filter(d => d !== driveId) };
      }
      // Toggle in target vdev
      const has = v.driveIds.includes(driveId);
      return {
        ...v,
        driveIds: has
          ? v.driveIds.filter(d => d !== driveId)
          : [...v.driveIds, driveId],
      };
    }));
  }

  // Drives not assigned to any vdev
  const unassignedDriveIds = useMemo(() => {
    const assigned = new Set(vdevGroups.flatMap(v => v.driveIds));
    return Array.from(selectedDriveIds).filter(id => !assigned.has(id));
  }, [vdevGroups, selectedDriveIds]);

  // ── Capacity estimation ─────────────────────────────────────────────────

  // Parse capacity strings
  function parseSize(s: string): number {
    const n = parseFloat(s);
    if (s.toUpperCase().endsWith('T')) return n * 1000;
    if (s.toUpperCase().endsWith('G')) return n;
    return n;
  }

  function fmtSize(g: number): string {
    return g >= 1000 ? `${(g / 1000).toFixed(1)}T` : `${Math.round(g)}G`;
  }

  function vdevUsable(vdev: VdevGroup): number {
    const drives = vdev.driveIds.map(id => allDrives.find(d => d.id === id)).filter(Boolean);
    if (drives.length === 0) return 0;
    const sizes = drives.map(d => parseSize(d!.capacity));
    const total = sizes.reduce((a, b) => a + b, 0);
    const min = Math.min(...sizes);
    const count = drives.length;
    switch (vdev.type) {
      case 'mirror': return min;
      case 'raidz1': return min * Math.max(0, count - 1);
      case 'raidz2': return min * Math.max(0, count - 2);
      case 'raidz3': return min * Math.max(0, count - 3);
      case 'stripe': return total;
      default:       return total;
    }
  }

  function estimateCapacity(): { raw: string; usable: string } {
    const count = selectedDrives.length;
    if (count === 0) return { raw: '0', usable: '0' };

    const sizes = selectedDrives.map(d => parseSize(d.capacity));
    const totalRaw = sizes.reduce((a, b) => a + b, 0);
    const minSize = Math.min(...sizes);

    let usable = totalRaw;
    if (poolType === 'zfs') {
      // Sum usable across all vdevs (excluding special/log/cache/spare)
      usable = vdevGroups
        .filter(v => !['special', 'log', 'cache', 'spare'].includes(v.type))
        .reduce((sum, v) => sum + vdevUsable(v), 0);
    } else if (poolType === 'raid') {
      switch (raidLevel) {
        case 'raid0':  usable = totalRaw; break;
        case 'raid1':  usable = minSize; break;
        case 'raid5':  usable = minSize * (count - 1); break;
        case 'raid6':  usable = minSize * (count - 2); break;
        case 'raid10': usable = totalRaw / 2; break;
      }
    }

    return { raw: fmtSize(totalRaw), usable: fmtSize(Math.max(0, usable)) };
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  function handleSubmit() {
    const finalVdevGroups: VdevGroup[] =
      poolType === 'zfs' ? vdevGroups : [];

    const finalRaidLevel =
      poolType === 'raid' ? raidLevel :
      poolType === 'zfs'  ? vdevType :
                            'stripe';

    onSubmit({
      deviceId,
      name:       poolName,
      color:      '#4a8fc4',
      poolType,
      raidLevel:  finalRaidLevel as StoragePool['raidLevel'],
      vdevGroups: finalVdevGroups,
      health:     'unknown',
      notes:      undefined,
    });
  }

  // ── Validation ──────────────────────────────────────────────────────────

  const canStep1 = poolName.trim().length > 0;
  const canStep2 = selectedDriveIds.size > 0;
  const canStep3 = true; // layout is always valid if we got here

  if (!open) return null;

  const { raw, usable } = estimateCapacity();

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div
        style={{
          background: '#1a1e22',
          border: '1px solid #2a3038',
          borderRadius: 8,
          padding: '28px 32px',
          width: 560,
          maxHeight: '80vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{
            fontFamily: 'Inter,system-ui,sans-serif', fontSize: 15, fontWeight: 600, color: '#d4d9dd',
          }}>
            Create Pool
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
          <StepDot num={1} label="Basics" state={step === 1 ? 'active' : step > 1 ? 'done' : 'pending'} />
          <StepDot num={2} label="Drives" state={step === 2 ? 'active' : step > 2 ? 'done' : 'pending'} />
          <StepDot num={3} label="Layout" state={step === 3 ? 'active' : step > 3 ? 'done' : 'pending'} />
          <StepDot num={4} label="Review" state={step === 4 ? 'active' : 'pending'} />
        </div>

        {/* ── Step 1: Pool Basics ───────────────────────────────────────── */}
        {step === 1 && (
          <div style={sectionStyle}>
            <div>
              <label style={labelStyle}>Pool Name</label>
              <input
                style={inputStyle}
                value={poolName}
                onChange={e => setPoolName(e.target.value)}
                placeholder="e.g. tank, data, backup"
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Pool Type</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {POOL_TYPES.map(pt => (
                  <button
                    key={pt.value}
                    onClick={() => setPoolType(pt.value)}
                    style={{
                      padding: '5px 14px',
                      fontSize: 11,
                      fontWeight: 500,
                      borderRadius: 4,
                      border: `1px solid ${poolType === pt.value ? '#c47c5a' : '#2a3038'}`,
                      background: poolType === pt.value ? '#c47c5a22' : 'transparent',
                      color: poolType === pt.value ? '#c47c5a' : '#8a9299',
                      cursor: 'pointer',
                      fontFamily: 'Inter,system-ui,sans-serif',
                    }}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Drive Selection ───────────────────────────────────── */}
        {step === 2 && (
          <div style={sectionStyle}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>
              Select drives ({selectedDriveIds.size} selected)
            </span>

            {/* Local drives */}
            {allDrives.filter(d => !('sourceDeviceName' in d)).length > 0 && (
              <div>
                <span style={{ fontSize: 10, color: '#5a6068' }}>Local</span>
                {allDrives.filter(d => !('sourceDeviceName' in d)).map(drive => (
                  <DriveCheckbox
                    key={drive.id}
                    drive={drive}
                    checked={selectedDriveIds.has(drive.id)}
                    onToggle={() => toggleDrive(drive.id)}
                  />
                ))}
              </div>
            )}

            {/* External drives */}
            {allDrives.filter(d => 'sourceDeviceName' in d).length > 0 && (
              <div>
                <span style={{ fontSize: 10, color: '#5a6068' }}>External</span>
                {allDrives.filter(d => 'sourceDeviceName' in d).map(drive => (
                  <DriveCheckbox
                    key={drive.id}
                    drive={drive}
                    checked={selectedDriveIds.has(drive.id)}
                    onToggle={() => toggleDrive(drive.id)}
                    badge={(drive as ExternalDrive).sourceDeviceName}
                  />
                ))}
              </div>
            )}

            {allDrives.length === 0 && (
              <div style={{ color: '#5a6068', fontSize: 11, padding: '8px 0' }}>
                No unassigned drives available.
              </div>
            )}

            {externalDrives.length === 0 && (
              <div
                style={{
                  padding: '8px 10px',
                  border: '1px dashed #2a3038',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#5a6068',
                  cursor: 'pointer',
                  marginTop: 4,
                }}
                onClick={onConnectExternal}
              >
                Need external storage? <span style={{ color: '#c47c5a' }}>Connect an external device &rarr;</span>
              </div>
            )}

            {/* Create Drive inline */}
            {!showCreateDrive ? (
              <div
                style={{
                  padding: '6px 10px',
                  border: '1px dashed #2a3038',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#5a6068',
                  cursor: 'pointer',
                  marginTop: 4,
                }}
                onClick={() => setShowCreateDrive(true)}
              >
                <span style={{ color: '#c47c5a' }}>+ Create a new drive</span>
              </div>
            ) : (
              <div style={{
                border: '1px solid #2a3038',
                borderRadius: 4,
                padding: '10px',
                background: '#111417',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginTop: 4,
              }}>
                <span style={{ fontSize: 10, color: '#5a6068', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  New Drive
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Label</label>
                    <input
                      type="text"
                      value={newDrive.label}
                      onChange={e => setNewDrive(p => ({ ...p, label: e.target.value }))}
                      placeholder="Optional"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Capacity *</label>
                    <input
                      type="text"
                      value={newDrive.capacity}
                      onChange={e => setNewDrive(p => ({ ...p, capacity: e.target.value }))}
                      placeholder="e.g. 4T"
                      style={inputStyle}
                      autoFocus
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Type</label>
                    <select
                      value={newDrive.driveType}
                      onChange={e => setNewDrive(p => ({ ...p, driveType: e.target.value as typeof newDrive.driveType }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="hdd">HDD</option>
                      <option value="ssd">SSD</option>
                      <option value="nvme">NVMe</option>
                      <option value="flash">Flash</option>
                      <option value="tape">Tape</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Interface</label>
                    <select
                      value={newDrive.interfaceType}
                      onChange={e => setNewDrive(p => ({ ...p, interfaceType: e.target.value as typeof newDrive.interfaceType }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="">—</option>
                      <option value="sata">SATA</option>
                      <option value="sas">SAS</option>
                      <option value="nvme">NVMe</option>
                      <option value="u2">U.2</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button style={btnGhost} onClick={() => setShowCreateDrive(false)}>Cancel</button>
                  <button
                    style={{ ...btnPrimary, opacity: newDrive.capacity.trim() ? 1 : 0.4 }}
                    disabled={!newDrive.capacity.trim() || createDrive.isPending}
                    onClick={handleCreateDrive}
                  >
                    {createDrive.isPending ? 'Creating…' : 'Create & Select'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Layout ────────────────────────────────────────────── */}
        {step === 3 && (
          <div style={sectionStyle}>
            {poolType === 'zfs' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>vdev Groups ({vdevGroups.length})</label>
                  <button
                    onClick={addVdevGroup}
                    style={{
                      ...btnGhost,
                      padding: '3px 10px',
                      fontSize: 10,
                    }}
                  >
                    + Add vdev
                  </button>
                </div>

                {vdevGroups.map((vdev, idx) => (
                  <div key={vdev.id} style={{
                    border: '1px solid #2a3038',
                    borderRadius: 4,
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    background: '#111417',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: '#8a9299', minWidth: 50 }}>
                        vdev {idx + 1}
                      </span>
                      <select
                        value={vdev.type}
                        onChange={e => setVdevGroupType(vdev.id, e.target.value as VdevType)}
                        style={{ ...inputStyle, width: 'auto', flex: 1, fontSize: 11, padding: '3px 8px' }}
                      >
                        {ZFS_VDEV_TYPES.map(vt => (
                          <option key={vt.value} value={vt.value}>{vt.label}</option>
                        ))}
                        <option value="special">Special</option>
                        <option value="log">Log</option>
                        <option value="cache">Cache</option>
                        <option value="spare">Spare</option>
                      </select>
                      {vdevGroups.length > 1 && (
                        <button
                          onClick={() => removeVdevGroup(vdev.id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#5a6068', fontSize: 14, padding: '0 4px',
                          }}
                          title="Remove vdev"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                    {/* Drive assignment for this vdev */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
                      {selectedDrives.map(drive => {
                        const inThisVdev = vdev.driveIds.includes(drive.id);
                        return (
                          <label key={drive.id} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 10, cursor: 'pointer',
                            color: inThisVdev ? '#d4d9dd' : '#5a6068',
                            padding: '2px 4px',
                            borderRadius: 3,
                            background: inThisVdev ? '#1e2428' : 'transparent',
                          }}>
                            <input
                              type="checkbox"
                              checked={inThisVdev}
                              onChange={() => toggleDriveInVdev(vdev.id, drive.id)}
                              style={{ accentColor: '#c47c5a' }}
                            />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {drive.model || drive.label || drive.serial || drive.driveType}
                            </span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#5a6068' }}>
                              {drive.capacity}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <span style={{ fontSize: 9, color: '#5a6068' }}>
                      {vdev.driveIds.length} drives &middot; ~{fmtSize(vdevUsable(vdev))} usable
                    </span>
                  </div>
                ))}

                {unassignedDriveIds.length > 0 && (
                  <div style={{ fontSize: 10, color: '#c4a43a', marginTop: 2 }}>
                    {unassignedDriveIds.length} drive{unassignedDriveIds.length !== 1 ? 's' : ''} not assigned to any vdev
                  </div>
                )}
              </>
            )}

            {poolType === 'raid' && (
              <>
                <label style={labelStyle}>RAID Level</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {RAID_LEVELS.map(rl => (
                    <button
                      key={rl.value}
                      onClick={() => setRaidLevel(rl.value)}
                      disabled={selectedDrives.length < rl.minDrives}
                      style={{
                        padding: '5px 14px',
                        fontSize: 11,
                        fontWeight: 500,
                        borderRadius: 4,
                        border: `1px solid ${raidLevel === rl.value ? '#c47c5a' : '#2a3038'}`,
                        background: raidLevel === rl.value ? '#c47c5a22' : 'transparent',
                        color: raidLevel === rl.value ? '#c47c5a' : '#8a9299',
                        cursor: selectedDrives.length >= rl.minDrives ? 'pointer' : 'not-allowed',
                        opacity: selectedDrives.length >= rl.minDrives ? 1 : 0.4,
                        fontFamily: 'Inter,system-ui,sans-serif',
                      }}
                    >
                      {rl.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {poolType === 'lvm' && (
              <div style={{ fontSize: 11, color: '#8a9299' }}>
                LVM volume group will be created with {selectedDrives.length} physical volumes.
              </div>
            )}

            {poolType === 'ceph' && (
              <div style={{ fontSize: 11, color: '#8a9299' }}>
                {selectedDrives.length} OSD{selectedDrives.length !== 1 ? 's' : ''} will be assigned.
              </div>
            )}

            {poolType === 'drive' && (
              <div style={{ fontSize: 11, color: '#8a9299' }}>
                Unraid parity assignment: first selected drive is parity, rest are data drives.
              </div>
            )}

            <div style={{
              padding: '8px 10px',
              background: '#111417',
              border: '1px solid #1e2428',
              borderRadius: 4,
              fontSize: 11,
              color: '#8a9299',
              marginTop: 4,
            }}>
              Estimated: {raw} raw &rarr; ~{usable} usable
            </div>
          </div>
        )}

        {/* ── Step 4: Review ────────────────────────────────────────────── */}
        {step === 4 && (
          <div style={sectionStyle}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '4px 12px',
              fontSize: 11,
              fontFamily: 'Inter,system-ui,sans-serif',
            }}>
              <span style={{ color: '#5a6068' }}>Name:</span>
              <span style={{ color: '#d4d9dd', fontWeight: 500 }}>{poolName}</span>

              <span style={{ color: '#5a6068' }}>Type:</span>
              <span style={{ color: '#d4d9dd' }}>{poolType.toUpperCase()}</span>

              <span style={{ color: '#5a6068' }}>Layout:</span>
              <span style={{ color: '#d4d9dd' }}>
                {poolType === 'zfs' ? vdevType : poolType === 'raid' ? raidLevel : 'default'}
              </span>

              <span style={{ color: '#5a6068' }}>Drives:</span>
              <span style={{ color: '#d4d9dd' }}>{selectedDrives.length}</span>

              <span style={{ color: '#5a6068' }}>Raw capacity:</span>
              <span style={{ color: '#d4d9dd' }}>{raw}</span>

              <span style={{ color: '#5a6068' }}>Usable capacity:</span>
              <span style={{ color: '#d4d9dd', fontWeight: 500 }}>~{usable}</span>
            </div>

            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 10, color: '#5a6068', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Drive list
              </span>
              {selectedDrives.map(d => (
                <div key={d.id} style={{
                  fontSize: 10, color: '#8a9299', padding: '2px 0',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {d.label || d.serial || d.driveType} &middot; {d.capacity}
                  {'sourceDeviceName' in d && (
                    <span style={{ color: '#c47c5a', marginLeft: 6 }}>
                      (from {(d as ExternalDrive).sourceDeviceName})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Navigation buttons ────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          {step > 1 && (
            <button style={btnGhost} onClick={() => setStep(s => (s - 1) as 1 | 2 | 3 | 4)}>
              Back
            </button>
          )}
          {step === 1 && (
            <button
              style={{ ...btnPrimary, opacity: canStep1 ? 1 : 0.4 }}
              disabled={!canStep1}
              onClick={() => setStep(2)}
            >
              Next
            </button>
          )}
          {step === 2 && (
            <button
              style={{ ...btnPrimary, opacity: canStep2 ? 1 : 0.4 }}
              disabled={!canStep2}
              onClick={advanceToStep3}
            >
              Next
            </button>
          )}
          {step === 3 && (
            <button style={btnPrimary} onClick={() => setStep(4)}>
              Next
            </button>
          )}
          {step === 4 && (
            <button style={btnPrimary} onClick={handleSubmit}>
              Create Pool
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Drive checkbox row ──────────────────────────────────────────────────────

interface DriveCheckboxProps {
  drive:    Drive;
  checked:  boolean;
  onToggle: () => void;
  badge?:   string;
}

function DriveCheckbox({ drive, checked, onToggle, badge }: DriveCheckboxProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 6px',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 11,
        fontFamily: 'Inter,system-ui,sans-serif',
        background: checked ? '#1e2428' : 'transparent',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ accentColor: '#c47c5a' }}
      />
      <span style={{ color: '#d4d9dd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {drive.label || drive.serial || drive.driveType.toUpperCase()}
      </span>
      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#8a9299' }}>
        {drive.capacity}
      </span>
      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#5a6068' }}>
        {drive.driveType}
      </span>
      {badge && (
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 3,
          background: '#2a1f15', color: '#c47c5a', fontWeight: 500,
        }}>
          {badge}
        </span>
      )}
    </label>
  );
}
