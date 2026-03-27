import { useState, useEffect } from 'react';
import { Modal }      from '../../../../components/ui/Modal';
import { Icon }       from '../../../../components/ui/Icon';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { useCan }     from '../../../../utils/can';
import { api }        from '../../../../utils/api';
import { uid }        from '../../../../utils/uid';
import type {
  StoragePool, Drive, DeviceInstance, DeviceTemplate,
  PoolType, RaidLevel, VdevGroup, VdevType,
} from '@werkstack/shared';

// ── Constants ─────────────────────────────────────────────────────────────────

const POOL_COLORS = [
  '#4a8fc4', '#4ac48a', '#c47c5a', '#c4b44a',
  '#8a5ac4', '#c44a6a', '#4ac4c4', '#c4844a',
];

const POOL_TYPES: { value: PoolType; label: string; desc: string }[] = [
  { value: 'zfs',   label: 'ZFS',   desc: 'Zettabyte File System — vdev groups, checksums, snapshots' },
  { value: 'raid',  label: 'RAID',  desc: 'Hardware or software RAID array' },
  { value: 'ceph',  label: 'Ceph',  desc: 'Distributed storage cluster' },
  { value: 'lvm',   label: 'LVM',   desc: 'Logical Volume Manager' },
  { value: 'drive', label: 'Drive', desc: 'Single drive or JBOD pass-through' },
];

const RAID_LEVELS: { value: RaidLevel; label: string; forTypes: PoolType[] }[] = [
  { value: 'single', label: 'Single',   forTypes: ['raid', 'drive', 'lvm'] },
  { value: 'mirror', label: 'Mirror',   forTypes: ['raid', 'lvm'] },
  { value: 'raid0',  label: 'RAID 0',   forTypes: ['raid'] },
  { value: 'raid1',  label: 'RAID 1',   forTypes: ['raid'] },
  { value: 'raid5',  label: 'RAID 5',   forTypes: ['raid'] },
  { value: 'raid6',  label: 'RAID 6',   forTypes: ['raid'] },
  { value: 'raid10', label: 'RAID 10',  forTypes: ['raid'] },
  { value: 'raidz1', label: 'RAIDZ-1',  forTypes: ['zfs'] },
  { value: 'raidz2', label: 'RAIDZ-2',  forTypes: ['zfs'] },
  { value: 'raidz3', label: 'RAIDZ-3',  forTypes: ['zfs'] },
  { value: 'stripe', label: 'Stripe',   forTypes: ['zfs', 'ceph', 'lvm'] },
];

const VDEV_TYPES: { value: VdevType; label: string }[] = [
  { value: 'stripe',  label: 'Stripe (no redundancy)' },
  { value: 'mirror',  label: 'Mirror' },
  { value: 'raidz1',  label: 'RAIDZ-1 (single parity)' },
  { value: 'raidz2',  label: 'RAIDZ-2 (double parity)' },
  { value: 'raidz3',  label: 'RAIDZ-3 (triple parity)' },
  { value: 'log',     label: 'Log (SLOG)' },
  { value: 'cache',   label: 'Cache (L2ARC)' },
  { value: 'special', label: 'Special' },
  { value: 'spare',   label: 'Spare' },
];

// ── Pool Wizard ───────────────────────────────────────────────────────────────

interface WizardState {
  step:             1 | 2 | 3 | 4;
  name:             string;
  deviceId:         string;
  color:            string;
  poolType:         PoolType;
  raidLevel:        RaidLevel;
  vdevType:         VdevType;     // ZFS: default vdev type for first group
  selectedDriveIds: Set<string>;  // non-ZFS drive selection
  vdevGroups:       VdevGroup[];  // ZFS: vdev group list built in step 3
  notes:            string;
}

function blankWizard(devices: DeviceInstance[]): WizardState {
  return {
    step: 1,
    name: '', deviceId: devices[0]?.id ?? '', color: POOL_COLORS[0],
    poolType: 'zfs', raidLevel: 'raidz1', vdevType: 'raidz1',
    selectedDriveIds: new Set(), vdevGroups: [], notes: '',
  };
}

interface PoolWizardProps {
  open:          boolean;
  onClose:       () => void;
  devices:       DeviceInstance[];
  drives:        Drive[];
  siteId:        string;
  accent:        string;
  av:            React.CSSProperties;
  onPoolSaved:   (p: StoragePool) => void;
  onDrivesUpdate: (drives: Drive[]) => void;
  allDrives:     Drive[];
}

function PoolWizard({ open, onClose, devices, drives, siteId, accent, av, onPoolSaved, onDrivesUpdate, allDrives }: PoolWizardProps) {
  const [w, setW] = useState<WizardState>(blankWizard(devices));
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  useEffect(() => {
    if (open) { setW(blankWizard(devices)); setBusy(false); setErr(''); }
  }, [open]);

  const upd = <K extends keyof WizardState>(k: K, v: WizardState[K]) =>
    setW(p => ({ ...p, [k]: v }));

  // Drives available for the selected device (not yet assigned to a pool)
  const deviceDrives = drives.filter(d => d.deviceId === w.deviceId);

  // ── ZFS vdev group management ─────────────────────────────────────────────
  function addVdevGroup() {
    upd('vdevGroups', [
      ...w.vdevGroups,
      { id: uid(), type: w.vdevType, driveIds: [] },
    ]);
  }

  function removeVdevGroup(groupId: string) {
    upd('vdevGroups', w.vdevGroups.filter(g => g.id !== groupId));
  }

  function setGroupType(groupId: string, type: VdevType) {
    upd('vdevGroups', w.vdevGroups.map(g => g.id === groupId ? { ...g, type } : g));
  }

  function toggleDriveInGroup(groupId: string, driveId: string) {
    upd('vdevGroups', w.vdevGroups.map(g => {
      if (g.id !== groupId) return g;
      const has = g.driveIds.includes(driveId);
      return { ...g, driveIds: has ? g.driveIds.filter(id => id !== driveId) : [...g.driveIds, driveId] };
    }));
  }

  // Which drive IDs are already assigned to any vdev group?
  const assignedDriveIds = new Set(w.vdevGroups.flatMap(g => g.driveIds));

  // ── Validation per step ───────────────────────────────────────────────────
  function validateStep(): string {
    if (w.step === 1) {
      if (!w.name.trim()) return 'pool name is required';
      if (!w.deviceId)    return 'device is required';
    }
    if (w.step === 3) {
      if (w.poolType === 'zfs') {
        if (w.vdevGroups.length === 0) return 'add at least one vdev group';
        if (w.vdevGroups.some(g => g.driveIds.length === 0)) return 'each vdev group must have at least one drive';
      } else {
        if (w.selectedDriveIds.size === 0) return 'select at least one drive';
      }
    }
    return '';
  }

  function next() {
    const e = validateStep();
    if (e) { setErr(e); return; }
    setErr('');
    upd('step', Math.min(4, w.step + 1) as WizardState['step']);
  }

  function back() {
    setErr('');
    upd('step', Math.max(1, w.step - 1) as WizardState['step']);
  }

  async function handleCreate() {
    const e = validateStep();
    if (e) { setErr(e); return; }
    setBusy(true); setErr('');

    let finalVdevGroups: VdevGroup[];
    if (w.poolType === 'zfs') {
      finalVdevGroups = w.vdevGroups;
    } else {
      finalVdevGroups = [{
        id: uid(),
        type: w.poolType === 'raid' ? (w.raidLevel as VdevType) : 'stripe',
        driveIds: [...w.selectedDriveIds],
      }];
    }

    try {
      const pool: StoragePool = await api.post(`/api/sites/${siteId}/pools`, {
        deviceId:   w.deviceId,
        name:       w.name.trim(),
        color:      w.color,
        poolType:   w.poolType,
        raidLevel:  w.raidLevel,
        vdevGroups: finalVdevGroups,
        notes:      w.notes || undefined,
      });

      // Assign drives to pool
      const drivesToAssign = w.poolType === 'zfs'
        ? finalVdevGroups.flatMap(g => g.driveIds)
        : [...w.selectedDriveIds];

      const updatedDrives = await Promise.all(
        drivesToAssign.map(driveId => {
          const d = allDrives.find(x => x.id === driveId);
          if (!d) return Promise.resolve(null as unknown as Drive);
          return api.patch<Drive>(`/api/sites/${siteId}/drives/${driveId}`, {
            deviceId: d.deviceId,
            slotBlockId: d.slotBlockId,
            label: d.label,
            capacity: d.capacity,
            driveType: d.driveType,
            serial: d.serial,
            poolId: pool.id,
            isBoot: d.isBoot,
            vmPassthrough: d.vmPassthrough,
          });
        })
      );

      const validUpdated = updatedDrives.filter(Boolean) as Drive[];
      if (validUpdated.length > 0) {
        const updatedMap = new Map(validUpdated.map(d => [d.id, d]));
        onDrivesUpdate(allDrives.map(d => updatedMap.get(d.id) ?? d));
      }

      onPoolSaved(pool);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to create pool');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  // Step labels for the indicator
  const stepLabels = [
    { n: 1, label: 'name & device' },
    { n: 2, label: 'pool type' },
    { n: 3, label: 'drives' },
    { n: 4, label: 'review' },
  ];

  return (
    <div className="wizard-modal-overlay">
      <div className="wizard-panel" style={{ width: 640 }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border, #1d2022)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: 'var(--text, #d4d9dd)' }}>
            new storage pool
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text3, #4e5560)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <Icon name="x" size={12} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="wizard-step-indicator" style={{ padding: '12px 20px', flexShrink: 0 }}>
          {stepLabels.map(({ n, label }) => (
            <div key={n} className={`wizard-step${w.step === n ? ' active' : ''}${w.step > n ? ' done' : ''}`}>
              <div className="wizard-step-num">{w.step > n ? '✓' : n}</div>
              <div className="wizard-step-label">{label}</div>
              {n < stepLabels.length && <div className="wizard-step-line" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', minHeight: 0 }}>
          {err && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--red, #c07070)', marginBottom: 12,
            }}>
              {err}
            </div>
          )}

          {/* ── Step 1: Name + Device + Color ── */}
          {w.step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="wiz-field">
                <label className="wiz-label">pool name *</label>
                <input
                  className="wiz-input"
                  value={w.name}
                  onChange={e => upd('name', e.target.value)}
                  placeholder="e.g. tank, data, backup"
                  autoFocus
                />
              </div>
              <div className="wiz-field">
                <label className="wiz-label">host device *</label>
                <select className="wiz-input" value={w.deviceId} onChange={e => upd('deviceId', e.target.value)}>
                  <option value="">— select device —</option>
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="wiz-field">
                <label className="wiz-label">color</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {POOL_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => upd('color', c)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: c, border: `2px solid ${w.color === c ? '#fff' : 'transparent'}`,
                        cursor: 'pointer', outline: 'none', flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="wiz-field">
                <label className="wiz-label">notes</label>
                <textarea
                  className="wiz-input"
                  value={w.notes}
                  onChange={e => upd('notes', e.target.value)}
                  rows={2}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Pool Type + Layout ── */}
          {w.step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="wiz-field">
                <label className="wiz-label">pool type *</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {POOL_TYPES.map(pt => (
                    <label key={pt.value} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 12px',
                      background: w.poolType === pt.value ? 'var(--border2, #262c30)' : 'transparent',
                      border: `1px solid ${w.poolType === pt.value ? accent : 'var(--border2, #262c30)'}`,
                      borderRadius: 6, cursor: 'pointer',
                    }}>
                      <input
                        type="radio"
                        name="poolType"
                        value={pt.value}
                        checked={w.poolType === pt.value}
                        onChange={() => upd('poolType', pt.value)}
                        style={{ marginTop: 2, accentColor: accent, flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: 'var(--text, #d4d9dd)' }}>
                          {pt.label}
                        </div>
                        <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, color: 'var(--text3, #4e5560)', marginTop: 2 }}>
                          {pt.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* ZFS: default vdev type */}
              {w.poolType === 'zfs' && (
                <div className="wiz-field">
                  <label className="wiz-label">default vdev type</label>
                  <select className="wiz-input" value={w.vdevType} onChange={e => upd('vdevType', e.target.value as VdevType)}>
                    {VDEV_TYPES.map(v => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* RAID: raid level */}
              {(w.poolType === 'raid' || w.poolType === 'lvm') && (
                <div className="wiz-field">
                  <label className="wiz-label">raid level</label>
                  <select className="wiz-input" value={w.raidLevel} onChange={e => upd('raidLevel', e.target.value as RaidLevel)}>
                    {RAID_LEVELS.filter(r => r.forTypes.includes(w.poolType)).map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Drives ── */}
          {w.step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {deviceDrives.length === 0 ? (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--text3, #4e5560)', padding: '12px 0',
                }}>
                  no drives found for this device. add drives in the drives tab first.
                </div>
              ) : w.poolType === 'zfs' ? (
                // ZFS: vdev group management
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text2, #8a9299)' }}>
                      vdev groups
                    </div>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={addVdevGroup}>
                      <Icon name="plus" size={10} /> add group
                    </button>
                  </div>

                  {w.vdevGroups.length === 0 && (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
                      click "add group" to create a vdev group, then assign drives to it
                    </div>
                  )}

                  {w.vdevGroups.map((group, gi) => (
                    <div key={group.id} style={{
                      background: 'var(--cardBg, #141618)',
                      border: '1px solid var(--border2, #262c30)',
                      borderRadius: 6, padding: 12,
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
                          group {gi + 1}
                        </span>
                        <select
                          className="wiz-input"
                          style={{ flex: 1, padding: '4px 8px', fontSize: 11 }}
                          value={group.type}
                          onChange={e => setGroupType(group.id, e.target.value as VdevType)}
                        >
                          {VDEV_TYPES.map(v => (
                            <option key={v.value} value={v.value}>{v.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => removeVdevGroup(group.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--text3, #4e5560)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </div>

                      {/* Drive assignment for this group */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {deviceDrives.map(d => {
                          const inThisGroup = group.driveIds.includes(d.id);
                          const inOtherGroup = !inThisGroup && assignedDriveIds.has(d.id);
                          return (
                            <label key={d.id} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '5px 8px', borderRadius: 4, cursor: inOtherGroup ? 'not-allowed' : 'pointer',
                              background: inThisGroup ? 'var(--border2, #262c30)' : 'transparent',
                              opacity: inOtherGroup ? 0.4 : 1,
                            }}>
                              <input
                                type="checkbox"
                                checked={inThisGroup}
                                disabled={inOtherGroup}
                                onChange={() => toggleDriveInGroup(group.id, d.id)}
                                style={{ accentColor: accent }}
                              />
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text2, #8a9299)' }}>
                                {d.label || d.capacity} — {d.capacity} {d.driveType}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Non-ZFS: simple drive multi-select
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text2, #8a9299)', marginBottom: 4 }}>
                    select drives
                  </div>
                  {deviceDrives.map(d => (
                    <label key={d.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 4, cursor: 'pointer',
                      background: w.selectedDriveIds.has(d.id) ? 'var(--border2, #262c30)' : 'transparent',
                      border: `1px solid ${w.selectedDriveIds.has(d.id) ? 'var(--border, #1d2022)' : 'transparent'}`,
                    }}>
                      <input
                        type="checkbox"
                        checked={w.selectedDriveIds.has(d.id)}
                        onChange={() => {
                          const next = new Set(w.selectedDriveIds);
                          next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                          upd('selectedDriveIds', next);
                        }}
                        style={{ accentColor: accent }}
                      />
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text2, #8a9299)' }}>
                        {d.label || d.capacity}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
                        {d.capacity} · {d.driveType}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Review ── */}
          {w.step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text2, #8a9299)' }}>
                review and confirm
              </div>
              {[
                ['name',     w.name],
                ['device',   devices.find(d => d.id === w.deviceId)?.name ?? '—'],
                ['type',     w.poolType.toUpperCase()],
                ['layout',   w.poolType === 'zfs'
                               ? `${w.vdevGroups.length} vdev group(s)`
                               : `${w.selectedDriveIds.size} drive(s), ${w.raidLevel}`],
                ['drives',   w.poolType === 'zfs'
                               ? String(w.vdevGroups.reduce((s, g) => s + g.driveIds.length, 0))
                               : String(w.selectedDriveIds.size)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)', minWidth: 70 }}>{k}</span>
                  <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: 'var(--text, #d4d9dd)' }}>{v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)', minWidth: 70 }}>color</span>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: w.color, border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '11px 20px',
          borderTop: '1px solid var(--border2, #262c30)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <button className="btn-ghost" onClick={w.step === 1 ? onClose : back} disabled={busy}>
            {w.step === 1 ? 'cancel' : 'back'}
          </button>
          {w.step < 4 ? (
            <button className="act-primary" style={av} onClick={next}>next →</button>
          ) : (
            <button className="act-primary" style={av} onClick={handleCreate} disabled={busy}>
              {busy ? 'creating…' : 'create pool'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pool edit modal ───────────────────────────────────────────────────────────

interface PoolEditModalProps {
  open:           boolean;
  onClose:        () => void;
  pool:           StoragePool | null;
  devices:        DeviceInstance[];
  drives:         Drive[];
  siteId:         string;
  accent:         string;
  av:             React.CSSProperties;
  onSaved:        (p: StoragePool) => void;
}

function PoolEditModal({ open, onClose, pool, devices: _devices, drives, siteId, accent, av, onSaved }: PoolEditModalProps) {
  type Draft = { name: string; color: string; notes: string; vdevGroups: VdevGroup[] };
  const [f, setF]       = useState<Draft>({ name: '', color: POOL_COLORS[0], notes: '', vdevGroups: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  useEffect(() => {
    if (!open || !pool) return;
    setErr(''); setBusy(false);
    setF({ name: pool.name, color: pool.color, notes: pool.notes ?? '', vdevGroups: pool.vdevGroups });
  }, [open, pool]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(p => ({ ...p, [k]: v }));

  const deviceDrives = drives.filter(d => d.deviceId === pool?.deviceId);
  const assignedIds  = new Set(f.vdevGroups.flatMap(g => g.driveIds));

  function addGroup() {
    set('vdevGroups', [...f.vdevGroups, { id: uid(), type: 'stripe', driveIds: [] }]);
  }
  function removeGroup(id: string) {
    set('vdevGroups', f.vdevGroups.filter(g => g.id !== id));
  }
  function setGroupType(id: string, type: VdevType) {
    set('vdevGroups', f.vdevGroups.map(g => g.id === id ? { ...g, type } : g));
  }
  function toggleDrive(groupId: string, driveId: string) {
    set('vdevGroups', f.vdevGroups.map(g => {
      if (g.id !== groupId) return g;
      const has = g.driveIds.includes(driveId);
      return { ...g, driveIds: has ? g.driveIds.filter(id => id !== driveId) : [...g.driveIds, driveId] };
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!pool) return;
    if (!f.name.trim()) { setErr('name is required'); return; }
    setBusy(true); setErr('');
    try {
      const result: StoragePool = await api.patch(`/api/sites/${siteId}/pools/${pool.id}`, {
        deviceId:   pool.deviceId,
        name:       f.name.trim(),
        color:      f.color,
        poolType:   pool.poolType,
        raidLevel:  pool.raidLevel,
        vdevGroups: f.vdevGroups,
        notes:      f.notes || undefined,
      });
      onSaved(result);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to save pool');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="edit pool" minWidth={500}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--red, #c07070)', flex: 1 }}>{err}</span>}
          <button className="btn-ghost" onClick={onClose} disabled={busy}>cancel</button>
          <button type="submit" form="pool-edit-form" className="act-primary" style={av} disabled={busy}>
            {busy ? 'saving…' : 'save'}
          </button>
        </div>
      }
    >
      <form id="pool-edit-form" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="wiz-grid2">
          <div className="wiz-field">
            <label className="wiz-label">name *</label>
            <input className="wiz-input" value={f.name} onChange={e => set('name', e.target.value)} autoFocus />
          </div>
          <div className="wiz-field">
            <label className="wiz-label">color</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {POOL_COLORS.map(c => (
                <button key={c} type="button" onClick={() => set('color', c)} style={{
                  width: 22, height: 22, borderRadius: '50%', background: c,
                  border: `2px solid ${f.color === c ? '#fff' : 'transparent'}`,
                  cursor: 'pointer', outline: 'none',
                }} />
              ))}
            </div>
          </div>
        </div>

        <div className="wiz-field">
          <label className="wiz-label">notes</label>
          <textarea className="wiz-input" value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ resize: 'vertical' }} />
        </div>

        {/* Vdev groups */}
        {pool?.poolType === 'zfs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="wiz-label" style={{ margin: 0 }}>vdev groups</label>
              <button type="button" className="btn-ghost" style={{ padding: '3px 8px', fontSize: 10 }} onClick={addGroup}>
                + add group
              </button>
            </div>
            {f.vdevGroups.map((group, gi) => (
              <div key={group.id} style={{
                background: 'var(--cardBg, #141618)',
                border: '1px solid var(--border2, #262c30)',
                borderRadius: 5, padding: 10,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--text3, #4e5560)' }}>group {gi + 1}</span>
                  <select className="wiz-input" style={{ flex: 1, padding: '3px 6px', fontSize: 10 }}
                    value={group.type} onChange={e => setGroupType(group.id, e.target.value as VdevType)}>
                    {VDEV_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                  <button type="button" onClick={() => removeGroup(group.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text3, #4e5560)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                    <Icon name="x" size={11} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {deviceDrives.map(d => {
                    const inThis  = group.driveIds.includes(d.id);
                    const inOther = !inThis && assignedIds.has(d.id);
                    return (
                      <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: inOther ? 'not-allowed' : 'pointer', opacity: inOther ? 0.4 : 1 }}>
                        <input type="checkbox" checked={inThis} disabled={inOther} onChange={() => toggleDrive(group.id, d.id)} style={{ accentColor: accent }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text2, #8a9299)' }}>
                          {d.label || d.capacity} · {d.capacity} {d.driveType}
                        </span>
                      </label>
                    );
                  })}
                  {deviceDrives.length === 0 && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>no drives on this device</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── Delete Pool Modal ─────────────────────────────────────────────────────────

interface DeletePoolModalProps {
  open:      boolean;
  onClose:   () => void;
  pool:      StoragePool | null;
  siteId:    string;
  onDeleted: (id: string) => void;
}

function DeletePoolModal({ open, onClose, pool, siteId, onDeleted }: DeletePoolModalProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  useEffect(() => { if (open) { setBusy(false); setErr(''); } }, [open]);

  async function handleDelete() {
    if (!pool) return;
    setBusy(true); setErr('');
    try {
      await api.delete(`/api/sites/${siteId}/pools/${pool.id}`);
      onDeleted(pool.id);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to delete pool');
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="delete pool" minWidth={400}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--red, #c07070)', flex: 1 }}>{err}</span>}
          <button className="btn-ghost" onClick={onClose} disabled={busy}>cancel</button>
          <button className="confirm-danger-btn" onClick={handleDelete} disabled={busy}>
            {busy ? 'deleting…' : 'delete pool'}
          </button>
        </div>
      }
    >
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: 'var(--text2, #8a9299)', lineHeight: 1.5 }}>
        Delete pool{' '}
        <span style={{ color: 'var(--text, #d4d9dd)', fontWeight: 600 }}>{pool?.name}</span>?
        Drives assigned to this pool will be unassigned. This cannot be undone.
      </div>
    </Modal>
  );
}

// ── StoragePoolsTab ───────────────────────────────────────────────────────────

interface Props {
  pools:          StoragePool[];
  devices:        DeviceInstance[];
  drives:         Drive[];
  templates:      DeviceTemplate[];
  siteId:         string;
  accent:         string;
  av:             React.CSSProperties;
  onPoolAdd:      (p: StoragePool) => void;
  onPoolUpdate:   (p: StoragePool) => void;
  onPoolDelete:   (id: string) => void;
  onDrivesUpdate: (drives: Drive[]) => void;
}

export function StoragePoolsTab({
  pools, devices, drives, siteId, accent, av,
  onPoolAdd, onPoolUpdate, onPoolDelete, onDrivesUpdate,
}: Props) {
  const { can } = useCan();
  const canEdit = can('storage', 'write');

  const [wizOpen, setWizOpen]   = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; pool: StoragePool | null }>({ open: false, pool: null });
  const [delModal, setDelModal]   = useState<{ open: boolean; pool: StoragePool | null }>({ open: false, pool: null });

  const deviceById = new Map(devices.map(d => [d.id, d]));
  const drivesByPool = new Map<string, Drive[]>();
  for (const d of drives) {
    if (d.poolId) {
      if (!drivesByPool.has(d.poolId)) drivesByPool.set(d.poolId, []);
      drivesByPool.get(d.poolId)!.push(d);
    }
  }

  // Drives not yet in a pool (available for wizard)
  const availableDrives = drives.filter(d => !d.poolId);

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--text, #d4d9dd)' }}>
            storage pools
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)', marginTop: 2 }}>
            {pools.length} pool{pools.length !== 1 ? 's' : ''}
          </div>
        </div>
        {canEdit && (
          <button className="act-primary" style={av} onClick={() => setWizOpen(true)}>
            <Icon name="plus" size={11} /> new pool
          </button>
        )}
      </div>

      {pools.length === 0 ? (
        <EmptyState
          icon="storage"
          title="no storage pools"
          subtitle={canEdit ? 'Use the wizard to create a ZFS, RAID, Ceph, LVM, or Drive pool.' : 'No storage pools have been created.'}
          action={canEdit ? (
            <button className="act-primary" style={av} onClick={() => setWizOpen(true)}>
              <Icon name="plus" size={11} /> new pool
            </button>
          ) : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {pools.map(pool => {
            const device   = deviceById.get(pool.deviceId);
            const poolDrives = drivesByPool.get(pool.id) ?? [];
            const groupCount = pool.vdevGroups.length;

            return (
              <div key={pool.id} className="pool-card" style={{
                background: 'var(--cardBg, #141618)',
                border: '1px solid var(--border2, #262c30)',
                borderRadius: 8, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 10,
                cursor: 'default', transition: 'border-color 0.1s, background 0.1s',
              }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: pool.color, flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.1)',
                    }} />
                    <span style={{
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize: 13, fontWeight: 600, color: 'var(--text, #d4d9dd)',
                    }}>
                      {pool.name}
                    </span>
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="st-act-btn" onClick={() => setEditModal({ open: true, pool })}
                        style={{ background: 'none', border: 'none', color: 'var(--text3, #4e5560)', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, display: 'flex', alignItems: 'center', transition: 'color 0.1s' }}>
                        <Icon name="edit" size={12} />
                      </button>
                      <button className="st-act-btn" onClick={() => setDelModal({ open: true, pool })}
                        style={{ background: 'none', border: 'none', color: 'var(--text3, #4e5560)', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, display: 'flex', alignItems: 'center', transition: 'color 0.1s' }}>
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Type + device */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: '#8a9299', background: '#1e2022',
                    border: '1px solid #3a4248', borderRadius: 3, padding: '2px 6px',
                    textTransform: 'uppercase',
                  }}>
                    {pool.poolType}
                  </span>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: '#8a9299', background: '#1e2022',
                    border: '1px solid #3a4248', borderRadius: 3, padding: '2px 6px',
                  }}>
                    {pool.raidLevel}
                  </span>
                </div>

                {/* Stats */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '4px 12px',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                }}>
                  <span style={{ color: 'var(--text3, #4e5560)' }}>device</span>
                  <span style={{ color: 'var(--text2, #8a9299)' }}>{device?.name ?? '—'}</span>
                  <span style={{ color: 'var(--text3, #4e5560)' }}>drives</span>
                  <span style={{ color: 'var(--text2, #8a9299)' }}>{poolDrives.length}</span>
                  {pool.poolType === 'zfs' && (
                    <>
                      <span style={{ color: 'var(--text3, #4e5560)' }}>vdev groups</span>
                      <span style={{ color: 'var(--text2, #8a9299)' }}>{groupCount}</span>
                    </>
                  )}
                </div>

                {/* Notes */}
                {pool.notes && (
                  <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, color: 'var(--text3, #4e5560)', lineHeight: 1.4 }}>
                    {pool.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {wizOpen && (
        <PoolWizard
          open={wizOpen}
          onClose={() => setWizOpen(false)}
          devices={devices}
          drives={availableDrives}
          siteId={siteId}
          accent={accent}
          av={av}
          onPoolSaved={onPoolAdd}
          onDrivesUpdate={onDrivesUpdate}
          allDrives={drives}
        />
      )}
      <PoolEditModal
        open={editModal.open}
        onClose={() => setEditModal({ open: false, pool: null })}
        pool={editModal.pool}
        devices={devices}
        drives={drives}
        siteId={siteId}
        accent={accent}
        av={av}
        onSaved={onPoolUpdate}
      />
      <DeletePoolModal
        open={delModal.open}
        onClose={() => setDelModal({ open: false, pool: null })}
        pool={delModal.pool}
        siteId={siteId}
        onDeleted={onPoolDelete}
      />
    </div>
  );
}
