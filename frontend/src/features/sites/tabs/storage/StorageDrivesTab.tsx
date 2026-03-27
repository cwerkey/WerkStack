import { useState, useEffect } from 'react';
import { Modal }      from '../../../../components/ui/Modal';
import { Icon }       from '../../../../components/ui/Icon';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { useCan }     from '../../../../utils/can';
import { api }        from '../../../../utils/api';
import type {
  Drive, DeviceInstance, StoragePool, DeviceTemplate, BlockType,
} from '@werkstack/shared';

const BAY_TYPES = new Set<BlockType>([
  'bay-3.5', 'bay-2.5', 'bay-2.5v', 'bay-m2', 'bay-u2', 'bay-flash', 'bay-sd',
]);

const DRIVE_COLORS: Record<string, string> = {
  hdd:   '#4a8fc4',
  ssd:   '#4ac48a',
  nvme:  '#c47c5a',
  flash: '#c4b44a',
  tape:  '#8a5ac4',
};

// ── DriveModal ────────────────────────────────────────────────────────────────

interface DriveDraft {
  deviceId:      string;
  slotBlockId:   string;
  label:         string;
  capacity:      string;
  driveType:     string;
  serial:        string;
  poolId:        string;
  isBoot:        boolean;
  vmPassthrough: string;
}

function blankDraft(deviceId = ''): DriveDraft {
  return {
    deviceId, slotBlockId: '', label: '', capacity: '',
    driveType: 'hdd', serial: '', poolId: '',
    isBoot: false, vmPassthrough: '',
  };
}

interface DriveModalProps {
  open:      boolean;
  onClose:   () => void;
  initial:   Drive | null;
  devices:   DeviceInstance[];
  pools:     StoragePool[];
  templates: DeviceTemplate[];
  drives:    Drive[];
  siteId:    string;
  accent:    string;
  av:        React.CSSProperties;
  onSaved:   (d: Drive) => void;
}

function DriveModal({
  open, onClose, initial, devices, pools, templates, drives, siteId, accent, av, onSaved,
}: DriveModalProps) {
  const [f, setF]       = useState<DriveDraft>(blankDraft());
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  useEffect(() => {
    if (!open) return;
    setErr(''); setBusy(false);
    setF(initial
      ? {
          deviceId:      initial.deviceId,
          slotBlockId:   initial.slotBlockId ?? '',
          label:         initial.label ?? '',
          capacity:      initial.capacity,
          driveType:     initial.driveType,
          serial:        initial.serial ?? '',
          poolId:        initial.poolId ?? '',
          isBoot:        initial.isBoot,
          vmPassthrough: initial.vmPassthrough ?? '',
        }
      : blankDraft(devices[0]?.id ?? '')
    );
  }, [open, initial]);

  const set = <K extends keyof DriveDraft>(k: K, v: DriveDraft[K]) =>
    setF(p => ({ ...p, [k]: v }));

  // Bay block options for the selected device
  const templateById = new Map(templates.map(t => [t.id, t]));
  const driveBySlot  = new Map(drives.filter(d => d.slotBlockId && d.id !== initial?.id).map(d => [d.slotBlockId!, d]));

  const bayOptions = (() => {
    const dev = devices.find(d => d.id === f.deviceId);
    if (!dev?.templateId) return [];
    const t = templateById.get(dev.templateId);
    if (!t) return [];
    const allBlocks = [...t.layout.front.map(b => ({ ...b, panel: 'front' as const })),
                       ...t.layout.rear.map(b => ({ ...b, panel: 'rear' as const }))];
    return allBlocks.filter(b => BAY_TYPES.has(b.type));
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.deviceId) { setErr('device is required'); return; }
    if (!f.capacity.trim()) { setErr('capacity is required'); return; }
    setBusy(true); setErr('');
    try {
      const payload = {
        deviceId:      f.deviceId,
        slotBlockId:   f.slotBlockId || undefined,
        label:         f.label || undefined,
        capacity:      f.capacity.trim(),
        driveType:     f.driveType,
        serial:        f.serial || undefined,
        poolId:        f.poolId || undefined,
        isBoot:        f.isBoot,
        vmPassthrough: f.vmPassthrough || undefined,
      };
      const result: Drive = initial
        ? await api.patch(`/api/sites/${siteId}/drives/${initial.id}`, payload)
        : await api.post(`/api/sites/${siteId}/drives`, payload);
      onSaved(result);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to save drive');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'edit drive' : 'add drive'}
      minWidth={480}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--red, #c07070)', flex: 1 }}>
              {err}
            </span>
          )}
          <button className="btn-ghost" onClick={onClose} disabled={busy}>cancel</button>
          <button type="submit" form="drive-form" className="act-primary" style={av} disabled={busy}>
            {busy ? 'saving…' : (initial ? 'save' : 'add drive')}
          </button>
        </div>
      }
    >
      <form id="drive-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Device select */}
        <div className="wiz-field">
          <label className="wiz-label">device *</label>
          <select className="wiz-input" value={f.deviceId} onChange={e => set('deviceId', e.target.value)}>
            <option value="">— select device —</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Slot */}
        <div className="wiz-field">
          <label className="wiz-label">bay slot</label>
          <select className="wiz-input" value={f.slotBlockId} onChange={e => set('slotBlockId', e.target.value)}>
            <option value="">— none (internal/unslotted) —</option>
            {bayOptions.map(b => {
              const occupied = driveBySlot.has(b.id);
              return (
                <option key={b.id} value={b.id} disabled={occupied}>
                  [{b.panel}] {b.type}{b.label ? ` — ${b.label}` : ''} (col {b.col}, row {b.row}){occupied ? ' [occupied]' : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div className="wiz-grid2">
          {/* Capacity */}
          <div className="wiz-field">
            <label className="wiz-label">capacity *</label>
            <input
              className="wiz-input"
              value={f.capacity}
              onChange={e => set('capacity', e.target.value)}
              placeholder="e.g. 4T, 960G, 256G"
            />
          </div>
          {/* Drive type */}
          <div className="wiz-field">
            <label className="wiz-label">type *</label>
            <select className="wiz-input" value={f.driveType} onChange={e => set('driveType', e.target.value)}>
              <option value="hdd">HDD</option>
              <option value="ssd">SSD</option>
              <option value="nvme">NVMe</option>
              <option value="flash">Flash</option>
              <option value="tape">Tape</option>
            </select>
          </div>
        </div>

        {/* Label */}
        <div className="wiz-field">
          <label className="wiz-label">label</label>
          <input
            className="wiz-input"
            value={f.label}
            onChange={e => set('label', e.target.value)}
            placeholder="e.g. Samsung 870 EVO"
          />
        </div>

        <div className="wiz-grid2">
          {/* Serial */}
          <div className="wiz-field">
            <label className="wiz-label">serial</label>
            <input className="wiz-input" value={f.serial} onChange={e => set('serial', e.target.value)} />
          </div>
          {/* Pool */}
          <div className="wiz-field">
            <label className="wiz-label">pool</label>
            <select className="wiz-input" value={f.poolId} onChange={e => set('poolId', e.target.value)}>
              <option value="">— none —</option>
              {pools.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* VM passthrough */}
        <div className="wiz-field">
          <label className="wiz-label">vm passthrough</label>
          <input
            className="wiz-input"
            value={f.vmPassthrough}
            onChange={e => set('vmPassthrough', e.target.value)}
            placeholder="VM name or ID (optional)"
          />
        </div>

        {/* Boot drive */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={f.isBoot}
            onChange={e => set('isBoot', e.target.checked)}
            style={{ accentColor: accent }}
          />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--text2, #8a9299)',
          }}>
            boot drive ★
          </span>
        </label>
      </form>
    </Modal>
  );
}

// ── DeleteDriveModal ──────────────────────────────────────────────────────────

interface DeleteDriveModalProps {
  open:      boolean;
  onClose:   () => void;
  drive:     Drive | null;
  siteId:    string;
  onDeleted: (id: string) => void;
}

function DeleteDriveModal({ open, onClose, drive, siteId, onDeleted }: DeleteDriveModalProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  useEffect(() => { if (open) { setBusy(false); setErr(''); } }, [open]);

  async function handleDelete() {
    if (!drive) return;
    setBusy(true); setErr('');
    try {
      await api.delete(`/api/sites/${siteId}/drives/${drive.id}`);
      onDeleted(drive.id);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to delete drive');
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="delete drive"
      minWidth={400}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--red, #c07070)', flex: 1 }}>
              {err}
            </span>
          )}
          <button className="btn-ghost" onClick={onClose} disabled={busy}>cancel</button>
          <button className="confirm-danger-btn" onClick={handleDelete} disabled={busy}>
            {busy ? 'deleting…' : 'delete drive'}
          </button>
        </div>
      }
    >
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: 'var(--text2, #8a9299)', lineHeight: 1.5 }}>
        Delete drive{' '}
        <span style={{ color: 'var(--text, #d4d9dd)', fontWeight: 600 }}>
          {drive?.label || drive?.capacity || 'unknown'}
        </span>
        ? This action cannot be undone.
      </div>
    </Modal>
  );
}

// ── StorageDrivesTab ──────────────────────────────────────────────────────────

interface Props {
  drives:        Drive[];
  devices:       DeviceInstance[];
  pools:         StoragePool[];
  templates:     DeviceTemplate[];
  siteId:        string;
  accent:        string;
  av:            React.CSSProperties;
  onDriveAdd:    (d: Drive) => void;
  onDriveUpdate: (d: Drive) => void;
  onDriveDelete: (id: string) => void;
}

export function StorageDrivesTab({
  drives, devices, pools, templates, siteId, accent, av,
  onDriveAdd, onDriveUpdate, onDriveDelete,
}: Props) {
  const { can } = useCan();
  const canEdit = can('storage', 'write');

  const [modal, setModal]     = useState<{ open: boolean; drive: Drive | null }>({ open: false, drive: null });
  const [delModal, setDelModal] = useState<{ open: boolean; drive: Drive | null }>({ open: false, drive: null });

  const deviceById = new Map(devices.map(d => [d.id, d]));
  const poolById   = new Map(pools.map(p => [p.id, p]));

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--text, #d4d9dd)' }}>
            drives
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)', marginTop: 2 }}>
            {drives.length} drive{drives.length !== 1 ? 's' : ''}
          </div>
        </div>
        {canEdit && (
          <button className="act-primary" style={av} onClick={() => setModal({ open: true, drive: null })}>
            <Icon name="plus" size={11} /> add drive
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--cardBg, #141618)',
        border: '1px solid var(--border2, #262c30)',
        borderRadius: 8, overflow: 'hidden',
      }}>
        {drives.length === 0 ? (
          <div style={{ padding: '8px 0' }}>
            <EmptyState
              icon="storage"
              title="no drives yet"
              subtitle={canEdit ? 'Add drives to document your storage hardware.' : 'No drives have been added.'}
              action={canEdit ? (
                <button className="act-primary" style={av} onClick={() => setModal({ open: true, drive: null })}>
                  <Icon name="plus" size={11} /> add drive
                </button>
              ) : undefined}
            />
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 24 }}></th>
                <th>device</th>
                <th>label</th>
                <th>capacity</th>
                <th>type</th>
                <th>pool</th>
                <th>passthrough</th>
                {canEdit && <th style={{ width: 72 }} />}
              </tr>
            </thead>
            <tbody>
              {drives.map(drive => {
                const device = deviceById.get(drive.deviceId);
                const pool   = drive.poolId ? poolById.get(drive.poolId) : undefined;
                return (
                  <tr key={drive.id} className="st-row">
                    {/* Boot star */}
                    <td style={{
                      textAlign: 'center',
                      color: drive.isBoot ? '#f0c040' : 'var(--text3, #4e5560)',
                      fontSize: 12,
                    }}>
                      {drive.isBoot ? '★' : ''}
                    </td>
                    <td style={{ color: 'var(--text2, #8a9299)' }}>{device?.name ?? '—'}</td>
                    <td className="pri">{drive.label || '—'}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{drive.capacity}</td>
                    <td>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                        color: DRIVE_COLORS[drive.driveType] ?? '#8a9299',
                        background: DRIVE_COLORS[drive.driveType] ? `${DRIVE_COLORS[drive.driveType]}22` : '#1e2022',
                        border: `1px solid ${DRIVE_COLORS[drive.driveType] ?? '#3a4248'}44`,
                        borderRadius: 3, padding: '1px 5px',
                      }}>
                        {drive.driveType}
                      </span>
                    </td>
                    <td>
                      {pool ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: pool.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{pool.name}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text3, #4e5560)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {drive.vmPassthrough ? (
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                          color: '#c47c5a', background: '#c47c5a22',
                          border: '1px solid #c47c5a44',
                          borderRadius: 3, padding: '1px 5px',
                        }}>
                          {drive.vmPassthrough}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text3, #4e5560)' }}>—</span>
                      )}
                    </td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            className="st-act-btn"
                            onClick={() => setModal({ open: true, drive })}
                            style={{ background: 'none', border: 'none', color: 'var(--text3, #4e5560)', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, display: 'flex', alignItems: 'center', transition: 'color 0.1s' }}
                          >
                            <Icon name="edit" size={13} />
                          </button>
                          <button
                            className="st-act-btn"
                            onClick={() => setDelModal({ open: true, drive })}
                            style={{ background: 'none', border: 'none', color: 'var(--text3, #4e5560)', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, display: 'flex', alignItems: 'center', transition: 'color 0.1s' }}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <DriveModal
        open={modal.open}
        onClose={() => setModal({ open: false, drive: null })}
        initial={modal.drive}
        devices={devices}
        pools={pools}
        templates={templates}
        drives={drives}
        siteId={siteId}
        accent={accent}
        av={av}
        onSaved={d => (modal.drive ? onDriveUpdate(d) : onDriveAdd(d))}
      />
      <DeleteDriveModal
        open={delModal.open}
        onClose={() => setDelModal({ open: false, drive: null })}
        drive={delModal.drive}
        siteId={siteId}
        onDeleted={onDriveDelete}
      />
    </div>
  );
}
