import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type {
  DeviceInstance,
  DeviceTemplate,
  Drive,
  ExternalDrive,
  StoragePool,
  Share,
  PlacedBlock,
  SlotOverride,
  InterfaceType,
  DriveInterfaceType,
} from '@werkstack/shared';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import { TemplateOverlay } from '@/components/TemplateOverlay';
import { BlockContextMenu } from '@/components/BlockContextMenu';
import type { ContextMenuItem } from '@/components/BlockContextMenu';
import { useCreateDrive, useAssignDrive, useUnassignDrive, useCreateShare } from '@/api/storage';
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
  onUpdateDevice:   (patch: Partial<DeviceInstance> & { id: string }) => void;
  siteId:           string;
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

function getAllBayBlocks(template?: DeviceTemplate): PlacedBlock[] {
  if (!template) return [];
  const allBlocks: PlacedBlock[] = [
    ...(template.layout?.front ?? []),
    ...(template.layout?.rear ?? []),
  ];
  return allBlocks.filter(b => {
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

const INTERFACE_TYPES: InterfaceType[] = ['sata', 'sas', 'nvme', 'u2'];

function isBayBlock(block: PlacedBlock): boolean {
  const def = BLOCK_DEF_MAP.get(block.type);
  return !!(def?.isSlot && block.type.startsWith('bay-'));
}

// ─── Slot Edit Form ─────────────────────────────────────────────────────────

interface SlotEditFormProps {
  block: PlacedBlock;
  override: SlotOverride;
  onSave: (override: SlotOverride) => void;
  onCancel: () => void;
}

function SlotEditForm({ block, override, onSave, onCancel }: SlotEditFormProps) {
  const [label, setLabel] = useState(override.label ?? '');
  const [interfaceTypes, setInterfaceTypes] = useState<Set<InterfaceType>>(
    new Set(override.interfaceTypes ?? []),
  );

  function toggleInterface(t: InterfaceType) {
    setInterfaceTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result: SlotOverride = {};
    if (label.trim()) result.label = label.trim();
    if (interfaceTypes.size > 0) result.interfaceTypes = [...interfaceTypes];
    onSave(result);
  }

  const def = BLOCK_DEF_MAP.get(block.type);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    fontSize: 12,
    background: 'var(--color-surface-2, #1a1e22)',
    border: '1px solid var(--color-border, #2a3038)',
    borderRadius: 4,
    color: 'var(--color-text, #d4d9dd)',
    fontFamily: "'Inter', system-ui, sans-serif",
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--color-text-dim, #5a6068)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 2,
  };

  return (
    <div className={styles.editOverlay}>
      <form onSubmit={handleSubmit} className={styles.editForm}>
        <div className={styles.editFormTitle}>
          Edit Bay — {def?.label ?? block.type}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>Slot Label</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={block.label || block.id}
              style={inputStyle}
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Interface Types</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {INTERFACE_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleInterface(t)}
                  className={interfaceTypes.has(t) ? styles.ifacePillOn : styles.ifacePill}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onCancel} className={styles.cancelBtn}>Cancel</button>
          <button type="submit" className={styles.saveBtn}>Save</button>
        </div>
      </form>
    </div>
  );
}

// ─── Drive Assignment Modal ──────────────────────────────────────────────────

interface DriveAssignModalProps {
  block: PlacedBlock;
  device: DeviceInstance;
  drives: Drive[];
  slotOverride?: SlotOverride;
  siteId: string;
  onClose: () => void;
}

function DriveAssignModal({ block, device, drives, slotOverride, siteId, onClose }: DriveAssignModalProps) {
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const createDrive = useCreateDrive(siteId);
  const assignDrive = useAssignDrive(siteId);
  const unassignDrive = useUnassignDrive(siteId);

  // Find current drive in this slot
  const currentDrive = drives.find(
    d => d.deviceId === device.id && d.slotBlockId === block.id,
  );

  // Filter unassigned drives by interface compatibility
  const slotInterfaces = slotOverride?.interfaceTypes;
  const unassignedDrives = drives.filter(d => {
    if (d.deviceId) return false; // already assigned
    if (slotInterfaces && slotInterfaces.length > 0 && d.interfaceType) {
      return slotInterfaces.includes(d.interfaceType as InterfaceType);
    }
    return true;
  });

  // New drive form state
  const [newDrive, setNewDrive] = useState({
    label: '',
    driveType: 'ssd' as 'hdd' | 'ssd' | 'nvme' | 'flash' | 'tape',
    capacity: '',
    serial: '',
    interfaceType: '' as DriveInterfaceType | '',
  });

  function handleAssign(driveId: string) {
    assignDrive.mutate(
      { driveId, deviceId: device.id, slotBlockId: block.id },
      { onSuccess: () => onClose() },
    );
  }

  function handleClear() {
    if (!currentDrive) return;
    unassignDrive.mutate(currentDrive.id, { onSuccess: () => onClose() });
  }

  function handleCreateAndAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!newDrive.capacity.trim()) return;
    createDrive.mutate(
      {
        deviceId: device.id,
        slotBlockId: block.id,
        label: newDrive.label || undefined,
        driveType: newDrive.driveType,
        capacity: newDrive.capacity,
        serial: newDrive.serial || undefined,
        interfaceType: newDrive.interfaceType || undefined,
        isBoot: false,
      },
      { onSuccess: () => onClose() },
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    fontSize: 12,
    background: 'var(--color-surface-2, #1a1e22)',
    border: '1px solid var(--color-border, #2a3038)',
    borderRadius: 4,
    color: 'var(--color-text, #d4d9dd)',
    fontFamily: "'Inter', system-ui, sans-serif",
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--color-text-dim, #5a6068)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const def = BLOCK_DEF_MAP.get(block.type);
  const slotLabel = slotOverride?.label || block.label || def?.label || block.type;

  return (
    <div className={styles.editOverlay}>
      <div className={styles.editForm} style={{ minWidth: 360, maxHeight: '70vh', overflow: 'auto' }}>
        <div className={styles.editFormTitle}>
          Assign Drive — {slotLabel}
        </div>

        {/* Current drive indicator */}
        {currentDrive && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', background: '#161a1d', borderRadius: 4,
            fontSize: 11, color: 'var(--color-text)',
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: 3,
              background: driveTypeColor(currentDrive.driveType),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 600, color: '#fff',
            }}>
              {currentDrive.driveType[0].toUpperCase()}
            </div>
            <span style={{ flex: 1 }}>
              {currentDrive.model || currentDrive.label || currentDrive.driveType.toUpperCase()}
              {' '}{currentDrive.capacity}
            </span>
            <button onClick={handleClear} className={styles.clearSlotBtn}>Clear Slot</button>
          </div>
        )}

        {/* Tab row */}
        {!currentDrive && (
          <>
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border, #2a3038)' }}>
              <button
                onClick={() => setMode('pick')}
                style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 500,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: mode === 'pick' ? 'var(--color-accent, #c47c5a)' : 'var(--color-text-muted)',
                  borderBottom: mode === 'pick' ? '2px solid var(--color-accent, #c47c5a)' : '2px solid transparent',
                }}
              >
                Pick Existing
              </button>
              <button
                onClick={() => setMode('new')}
                style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 500,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: mode === 'new' ? 'var(--color-accent, #c47c5a)' : 'var(--color-text-muted)',
                  borderBottom: mode === 'new' ? '2px solid var(--color-accent, #c47c5a)' : '2px solid transparent',
                }}
              >
                Create New
              </button>
            </div>

            {mode === 'pick' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
                {unassignedDrives.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 11, padding: 12 }}>
                    No unassigned drives available
                  </p>
                ) : (
                  unassignedDrives.map(d => (
                    <div
                      key={d.id}
                      className={styles.drivePickRow}
                      onClick={() => handleAssign(d.id)}
                    >
                      <div style={{
                        width: 14, height: 14, borderRadius: 3,
                        background: driveTypeColor(d.driveType),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, fontWeight: 600, color: '#fff', flexShrink: 0,
                      }}>
                        {d.driveType[0].toUpperCase()}
                      </div>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.model || d.label || d.driveType.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-muted)' }}>
                        {d.capacity}
                      </span>
                      {d.interfaceType && (
                        <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: '#1a2020', color: '#6a9a8a' }}>
                          {d.interfaceType.toUpperCase()}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {mode === 'new' && (
              <form onSubmit={handleCreateAndAssign} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input type="text" value={newDrive.label} onChange={e => setNewDrive(p => ({ ...p, label: e.target.value }))} placeholder="Optional label" style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Type</label>
                    <select value={newDrive.driveType} onChange={e => setNewDrive(p => ({ ...p, driveType: e.target.value as typeof newDrive.driveType }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="hdd">HDD</option>
                      <option value="ssd">SSD</option>
                      <option value="nvme">NVMe</option>
                      <option value="flash">Flash</option>
                      <option value="tape">Tape</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Capacity *</label>
                    <input type="text" value={newDrive.capacity} onChange={e => setNewDrive(p => ({ ...p, capacity: e.target.value }))} placeholder="e.g. 4T" style={inputStyle} required />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Interface</label>
                    <select value={newDrive.interfaceType} onChange={e => setNewDrive(p => ({ ...p, interfaceType: e.target.value as typeof newDrive.interfaceType }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">—</option>
                      <option value="sata">SATA</option>
                      <option value="sas">SAS</option>
                      <option value="nvme">NVMe</option>
                      <option value="u2">U.2</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Serial</label>
                    <input type="text" value={newDrive.serial} onChange={e => setNewDrive(p => ({ ...p, serial: e.target.value }))} placeholder="Optional" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
                  <button type="submit" className={styles.saveBtn} disabled={!newDrive.capacity.trim()}>Create & Assign</button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Close button for when current drive exists */}
        {currentDrive && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} className={styles.cancelBtn}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Drive Modal (standalone, no bay assignment) ────────────────────────

interface AddDriveModalProps {
  device: DeviceInstance;
  siteId: string;
  onClose: () => void;
}

function AddDriveModal({ device, siteId, onClose }: AddDriveModalProps) {
  const createDrive = useCreateDrive(siteId);
  const [form, setForm] = useState({
    label: '',
    model: '',
    driveType: 'ssd' as 'hdd' | 'ssd' | 'nvme' | 'flash' | 'tape',
    capacity: '',
    serial: '',
    interfaceType: '' as DriveInterfaceType | '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.capacity.trim()) return;
    createDrive.mutate(
      {
        deviceId: device.id,
        label: form.label || undefined,
        model: form.model || undefined,
        driveType: form.driveType,
        capacity: form.capacity,
        serial: form.serial || undefined,
        interfaceType: form.interfaceType || undefined,
        isBoot: false,
      },
      { onSuccess: () => onClose() },
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    fontSize: 12,
    background: 'var(--color-surface-2, #1a1e22)',
    border: '1px solid var(--color-border, #2a3038)',
    borderRadius: 4,
    color: 'var(--color-text, #d4d9dd)',
    fontFamily: "'Inter', system-ui, sans-serif",
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--color-text-dim, #5a6068)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <div className={styles.editOverlay}>
      <form onSubmit={handleSubmit} className={styles.editForm} style={{ minWidth: 340 }}>
        <div className={styles.editFormTitle}>Add Drive — {device.name}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Label</label>
              <input type="text" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="Optional" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Model</label>
              <input type="text" value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} placeholder="Optional" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              <select value={form.driveType} onChange={e => setForm(p => ({ ...p, driveType: e.target.value as typeof form.driveType }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="hdd">HDD</option>
                <option value="ssd">SSD</option>
                <option value="nvme">NVMe</option>
                <option value="flash">Flash</option>
                <option value="tape">Tape</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Capacity *</label>
              <input type="text" value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} placeholder="e.g. 4T, 960G" style={inputStyle} required />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Interface</label>
              <select value={form.interfaceType} onChange={e => setForm(p => ({ ...p, interfaceType: e.target.value as typeof form.interfaceType }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">—</option>
                <option value="sata">SATA</option>
                <option value="sas">SAS</option>
                <option value="nvme">NVMe</option>
                <option value="u2">U.2</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Serial</label>
              <input type="text" value={form.serial} onChange={e => setForm(p => ({ ...p, serial: e.target.value }))} placeholder="Optional" style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
          <button type="submit" className={styles.saveBtn} disabled={!form.capacity.trim()}>Add Drive</button>
        </div>
      </form>
    </div>
  );
}

// ─── Create Share Modal ──────────────────────────────────────────────────────

interface CreateShareModalProps {
  pools:   StoragePool[];
  siteId:  string;
  onClose: () => void;
}

function CreateShareModal({ pools, siteId, onClose }: CreateShareModalProps) {
  const createShare = useCreateShare(siteId);
  const [form, setForm] = useState({
    name:       '',
    protocol:   'smb' as 'smb' | 'nfs' | 'iscsi',
    poolId:     pools.length > 0 ? pools[0].id : '',
    path:       '',
    accessMode: 'auth' as 'public' | 'auth' | 'list',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.poolId) return;
    createShare.mutate(
      {
        poolId:     form.poolId,
        name:       form.name.trim(),
        protocol:   form.protocol,
        path:       form.path.trim() || undefined,
        accessMode: form.accessMode,
        accessList: [],
      },
      { onSuccess: () => onClose() },
    );
  }

  const inputStyle: React.CSSProperties = {
    width:       '100%',
    padding:     '5px 8px',
    fontSize:    12,
    background:  'var(--color-surface-2, #1a1e22)',
    border:      '1px solid var(--color-border, #2a3038)',
    borderRadius: 4,
    color:       'var(--color-text, #d4d9dd)',
    fontFamily:  "'Inter', system-ui, sans-serif",
    boxSizing:   'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize:      10,
    color:         'var(--color-text-dim, #5a6068)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <div className={styles.editOverlay}>
      <form onSubmit={handleSubmit} className={styles.editForm} style={{ minWidth: 340 }}>
        <div className={styles.editFormTitle}>Create Share</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. media, backups"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Protocol</label>
              <select
                value={form.protocol}
                onChange={e => setForm(p => ({ ...p, protocol: e.target.value as typeof form.protocol }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="smb">SMB</option>
                <option value="nfs">NFS</option>
                <option value="iscsi">iSCSI</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Access Mode</label>
              <select
                value={form.accessMode}
                onChange={e => setForm(p => ({ ...p, accessMode: e.target.value as typeof form.accessMode }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="public">Public</option>
                <option value="auth">Authenticated</option>
                <option value="list">Access List</option>
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Pool *</label>
            <select
              value={form.poolId}
              onChange={e => setForm(p => ({ ...p, poolId: e.target.value }))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {pools.length === 0 && <option value="">No pools available</option>}
              {pools.map(pool => (
                <option key={pool.id} value={pool.id}>
                  {pool.name} ({pool.poolType.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Path / Dataset</label>
            <input
              type="text"
              value={form.path}
              onChange={e => setForm(p => ({ ...p, path: e.target.value }))}
              placeholder="e.g. /mnt/tank/media"
              style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
          <button
            type="submit"
            className={styles.saveBtn}
            disabled={!form.name.trim() || !form.poolId || createShare.isPending}
          >
            {createShare.isPending ? 'Creating…' : 'Create Share'}
          </button>
        </div>
      </form>
    </div>
  );
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
  onUpdateDevice,
  siteId,
}: StorageTabProps) {
  const [expandedPoolId, setExpandedPoolId] = useState<string | null>(null);
  const [addDriveOpen, setAddDriveOpen] = useState(false);
  const [createShareOpen, setCreateShareOpen] = useState(false);

  // ── Context menu state ─────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ block: PlacedBlock; x: number; y: number } | null>(null);
  const [editingSlot, setEditingSlot] = useState<PlacedBlock | null>(null);
  const [assigningBay, setAssigningBay] = useState<PlacedBlock | null>(null);

  const slotOverrides = device.slotOverrides ?? {};

  // ── Bay rendering ──────────────────────────────────────────────────────

  const faceContainerRef = useRef<HTMLDivElement>(null);
  const [faceWidth, setFaceWidth] = useState(0);

  useEffect(() => {
    const el = faceContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setFaceWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bayBlocks = useMemo(() => getAllBayBlocks(template), [template]);
  const hasBays = bayBlocks.length > 0;

  // Build bay-only view: filter template blocks to only bays
  const frontBays = useMemo(
    () => (template?.layout?.front ?? []).filter(isBayBlock),
    [template],
  );
  const rearBays = useMemo(
    () => (template?.layout?.rear ?? []).filter(isBayBlock),
    [template],
  );

  // Compute grid dimensions for bay view
  const gridCols = template?.gridCols ?? 96;
  const gridRows = (template?.uHeight ?? 1) * 12;
  const faceHeight = faceWidth > 0 ? (faceWidth / gridCols) * gridRows : 0;

  // Bay color/label maps
  const { bayColors, bayLabels, bayBorderColors } = useMemo(() => {
    const colors: Record<string, string> = {};
    const labels: Record<string, string> = {};
    const borders: Record<string, string> = {};
    for (const block of bayBlocks) {
      const drive = drives.find(
        d => d.deviceId === device.id && d.slotBlockId === block.id,
      );
      const ov = slotOverrides[block.id];
      if (drive) {
        colors[block.id] = driveTypeColor(drive.driveType);
        labels[block.id] = ov?.label || drive.model || drive.label || drive.capacity;
        borders[block.id] = driveTypeColor(drive.driveType);
      } else {
        colors[block.id] = '#1a1e22';
        labels[block.id] = ov?.label || block.label || '';
        borders[block.id] = '#3a4248';
      }
    }
    return { bayColors: colors, bayLabels: labels, bayBorderColors: borders };
  }, [bayBlocks, drives, device.id, slotOverrides]);

  // Context menu handler (right-click on bay)
  const handleBayContextMenu = useCallback((block: PlacedBlock, e: React.MouseEvent) => {
    if (!isBayBlock(block)) return;
    setCtxMenu({ block, x: e.clientX, y: e.clientY });
  }, []);

  // Double-click handler (assign drive)
  const handleBayDoubleClick = useCallback((block: PlacedBlock) => {
    if (!isBayBlock(block)) return;
    setAssigningBay(block);
  }, []);

  const ctxItems: ContextMenuItem[] = ctxMenu ? [
    { label: 'Rename Slot', onClick: () => setEditingSlot(ctxMenu.block) },
    { label: 'Set Interface', onClick: () => setEditingSlot(ctxMenu.block) },
    { label: 'Assign Drive', onClick: () => setAssigningBay(ctxMenu.block) },
  ] : [];

  function handleSlotSave(override: SlotOverride) {
    if (!editingSlot) return;
    const updated = { ...slotOverrides };
    if (Object.keys(override).length === 0) {
      delete updated[editingSlot.id];
    } else {
      updated[editingSlot.id] = override;
    }
    onUpdateDevice({ id: device.id, slotOverrides: updated });
    setEditingSlot(null);
  }

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

      {/* ── Bay Rendering ─────────────────────────────────────────────── */}
      {hasBays && (
        <div ref={faceContainerRef} className={styles.baySection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Bay Layout</span>
          </div>
          {faceWidth > 0 && (
            <>
              {frontBays.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span className={styles.faceLabel}>Front</span>
                  <div className={styles.faceCanvas} style={{ width: faceWidth, height: faceHeight }}>
                    <TemplateOverlay
                      blocks={frontBays}
                      gridCols={gridCols}
                      gridRows={gridRows}
                      width={faceWidth}
                      height={faceHeight}
                      blockColors={bayColors}
                      blockLabels={bayLabels}
                      blockBorderColors={bayBorderColors}
                      onBlockContextMenu={handleBayContextMenu}
                      onBlockDoubleClick={handleBayDoubleClick}
                      showLabels
                      interactive
                    />
                  </div>
                </div>
              )}
              {rearBays.length > 0 && (
                <div>
                  <span className={styles.faceLabel}>Rear</span>
                  <div className={styles.faceCanvas} style={{ width: faceWidth, height: faceHeight }}>
                    <TemplateOverlay
                      blocks={rearBays}
                      gridCols={gridCols}
                      gridRows={gridRows}
                      width={faceWidth}
                      height={faceHeight}
                      blockColors={bayColors}
                      blockLabels={bayLabels}
                      blockBorderColors={bayBorderColors}
                      onBlockContextMenu={handleBayContextMenu}
                      onBlockDoubleClick={handleBayDoubleClick}
                      showLabels
                      interactive
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Drives Section ─────────────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            Drives ({localDrives.length + externalDrives.length})
          </span>
          <button className={styles.addBtn} onClick={() => setAddDriveOpen(true)}>
            + Add Drive
          </button>
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
          <button className={styles.addBtn} onClick={() => setCreateShareOpen(true)}>
            + Create Share
          </button>
        </div>

        {poolShares.length === 0 && (
          <p className={styles.empty}>No shares configured</p>
        )}

        {poolShares.map(share => (
          <ShareRow key={share.id} share={share} pools={devicePools} />
        ))}
      </div>

      {/* ── Context Menu ──────────────────────────────────────────────── */}
      {ctxMenu && (
        <BlockContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── Slot Edit Form ────────────────────────────────────────────── */}
      {editingSlot && (
        <SlotEditForm
          block={editingSlot}
          override={slotOverrides[editingSlot.id] ?? {}}
          onSave={handleSlotSave}
          onCancel={() => setEditingSlot(null)}
        />
      )}

      {/* ── Drive Assignment Modal ────────────────────────────────────── */}
      {assigningBay && (
        <DriveAssignModal
          block={assigningBay}
          device={device}
          drives={drives}
          slotOverride={slotOverrides[assigningBay.id]}
          siteId={siteId}
          onClose={() => setAssigningBay(null)}
        />
      )}

      {/* ── Add Drive Modal ───────────────────────────────────────────── */}
      {addDriveOpen && (
        <AddDriveModal
          device={device}
          siteId={siteId}
          onClose={() => setAddDriveOpen(false)}
        />
      )}

      {/* ── Create Share Modal ────────────────────────────────────────── */}
      {createShareOpen && (
        <CreateShareModal
          pools={devicePools}
          siteId={siteId}
          onClose={() => setCreateShareOpen(false)}
        />
      )}
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
      {drive.interfaceType && (
        <span className={styles.ifaceBadge}>{drive.interfaceType.toUpperCase()}</span>
      )}
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
