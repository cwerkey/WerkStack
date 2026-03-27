import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Modal }        from '../../../components/ui/Modal';
import { EmptyState }   from '../../../components/ui/EmptyState';
import { Icon }         from '../../../components/ui/Icon';
import { useRackStore } from '../../../store/useRackStore';
import { useCan }       from '../../../utils/can';
import { api }          from '../../../utils/api';
import type { SiteCtx } from '../../SiteShell';
import type { Rack, Zone } from '@werkstack/shared';

// ── RackFormModal ──────────────────────────────────────────────────────────────

interface RackFormModalProps {
  open:     boolean;
  onClose:  () => void;
  initial:  Rack | null;
  siteId:   string;
  accent:   string;
  zones:    Zone[];
  onSaved:  (r: Rack) => void;
}

function RackFormModal({ open, onClose, initial, siteId, accent, zones, onSaved }: RackFormModalProps) {
  type Draft = { name: string; zoneId: string; uHeight: string };
  const [f, setF]       = useState<Draft>({ name: '', zoneId: '', uHeight: '42' });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  const av = { '--accent': accent } as React.CSSProperties;

  useEffect(() => {
    if (!open) return;
    setErr('');
    setBusy(false);
    setF(initial
      ? { name: initial.name, zoneId: initial.zoneId ?? '', uHeight: String(initial.uHeight) }
      : { name: '', zoneId: '', uHeight: '42' }
    );
  }, [open, initial]);

  const set = (k: keyof Draft, v: string) => setF(p => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setErr('name is required'); return; }
    const uH = parseInt(f.uHeight, 10);
    if (!uH || uH < 1 || uH > 100) { setErr('uHeight must be 1–100'); return; }
    setBusy(true);
    setErr('');
    try {
      const payload = {
        name:    f.name.trim(),
        zoneId:  f.zoneId || undefined,
        uHeight: uH,
      };
      const result = initial
        ? await api.patch<Rack>(`/api/sites/${siteId}/racks/${initial.id}`, payload)
        : await api.post<Rack>(`/api/sites/${siteId}/racks`, payload);
      onSaved(result!);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to save rack');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'edit rack' : 'add rack'}
      minWidth={420}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--red, #c07070)', flex: 1,
            }}>
              {err}
            </span>
          )}
          <button className="btn-ghost" onClick={onClose} disabled={busy}>cancel</button>
          <button
            type="submit"
            form="rack-form"
            className="act-primary"
            style={av}
            disabled={busy}
          >
            {busy ? 'saving…' : (initial ? 'save' : 'add rack')}
          </button>
        </div>
      }
    >
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
      `}</style>
      <form id="rack-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="wiz-field">
          <label className="wiz-label">name *</label>
          <input
            className="wiz-input"
            value={f.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Rack A, Core Switch Rack"
            autoFocus
          />
        </div>
        <div className="wiz-grid2">
          <div className="wiz-field">
            <label className="wiz-label">u height</label>
            <input
              className="wiz-input"
              type="number"
              min={1}
              max={100}
              value={f.uHeight}
              onChange={e => set('uHeight', e.target.value)}
            />
          </div>
          <div className="wiz-field">
            <label className="wiz-label">zone (optional)</label>
            <select
              className="wiz-input"
              value={f.zoneId}
              onChange={e => set('zoneId', e.target.value)}
            >
              <option value="">— none —</option>
              {zones.map(z => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── DeleteRackModal ────────────────────────────────────────────────────────────

interface DeleteRackModalProps {
  open:      boolean;
  onClose:   () => void;
  rack:      Rack | null;
  siteId:    string;
  onDeleted: (id: string) => void;
}

function DeleteRackModal({ open, onClose, rack, siteId, onDeleted }: DeleteRackModalProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  useEffect(() => { if (open) { setBusy(false); setErr(''); } }, [open]);

  async function handleDelete() {
    if (!rack) return;
    setBusy(true);
    setErr('');
    try {
      await api.delete(`/api/sites/${siteId}/racks/${rack.id}`);
      onDeleted(rack.id);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to delete rack');
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="delete rack"
      minWidth={400}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--red, #c07070)', flex: 1,
            }}>
              {err}
            </span>
          )}
          <button className="btn-ghost" onClick={onClose} disabled={busy}>cancel</button>
          <button className="confirm-danger-btn" onClick={handleDelete} disabled={busy}>
            {busy ? 'deleting…' : 'delete rack'}
          </button>
        </div>
      }
    >
      <style>{`
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .confirm-danger-btn:hover { background: #a85858 !important; border-color: #a85858 !important; }
      `}</style>
      <div style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 13, color: 'var(--text2, #8a9299)', lineHeight: 1.5,
      }}>
        Delete rack <span style={{ color: 'var(--text, #d4d9dd)', fontWeight: 600 }}>
          {rack?.name}
        </span> ({rack?.uHeight}U)? All devices in this rack will be unassigned.
        This action cannot be undone.
      </div>
    </Modal>
  );
}

// ── RackSetupScreen ───────────────────────────────────────────────────────────

export function RackSetupScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;
  const { can } = useCan();
  const canEdit = can('site', 'write');

  const racks       = useRackStore(s => s.racks);
  const upsertRack  = useRackStore(s => s.upsertRack);
  const removeRack  = useRackStore(s => s.removeRack);

  // Zones for the zone picker
  const [zones, setZones] = useState<Zone[]>([]);
  useEffect(() => {
    if (!site) return;
    api.get<Zone[]>(`/api/sites/${site.id}/zones`).then(z => setZones(z ?? [])).catch(() => {});
  }, [site?.id]);

  // Modal state
  const [rackModal, setRackModal] = useState<{ open: boolean; rack: Rack | null }>({
    open: false, rack: null,
  });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; rack: Rack | null }>({
    open: false, rack: null,
  });

  const handleRackSaved = useCallback((r: Rack) => {
    upsertRack(r);
  }, [upsertRack]);

  const handleRackDeleted = useCallback((id: string) => {
    removeRack(id);
  }, [removeRack]);

  // Zone name lookup
  const getZoneName = (zoneId?: string) => {
    if (!zoneId) return '—';
    return zones.find(z => z.id === zoneId)?.name ?? '—';
  };

  // Group racks by zone
  const racksByZone = new Map<string, Rack[]>();
  const unzoned: Rack[] = [];
  for (const r of racks) {
    if (r.zoneId) {
      if (!racksByZone.has(r.zoneId)) racksByZone.set(r.zoneId, []);
      racksByZone.get(r.zoneId)!.push(r);
    } else {
      unzoned.push(r);
    }
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      ...av, ...css.vars,
    } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .rack-row:hover td { background: var(--cardBg, #141618) !important; }
        .rack-action-btn:hover { color: var(--text, #d4d9dd) !important; }
      `}</style>

      <div style={{ padding: '24px 28px', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontFamily: "'Ubuntu', sans-serif",
              fontSize: 14, fontWeight: 700, color: 'var(--text, #d4d9dd)',
            }}>
              rack setup
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: 'var(--text3, #4e5560)', marginTop: 2,
            }}>
              {racks.length} rack{racks.length !== 1 ? 's' : ''}
            </div>
          </div>
          {canEdit && site && (
            <button
              className="act-primary"
              style={av}
              onClick={() => setRackModal({ open: true, rack: null })}
            >
              <Icon name="plus" size={11} /> add rack
            </button>
          )}
        </div>

        {/* Rack list */}
        <div style={{
          background: 'var(--cardBg, #141618)',
          border: '1px solid var(--border2, #262c30)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {racks.length === 0 ? (
            <div style={{ padding: '8px 0' }}>
              <EmptyState
                icon="rack"
                title="no racks yet"
                subtitle={canEdit ? 'Add a rack to start organizing your devices.' : 'No racks have been created for this site.'}
                action={
                  canEdit && site ? (
                    <button
                      className="act-primary"
                      style={av}
                      onClick={() => setRackModal({ open: true, rack: null })}
                    >
                      <Icon name="plus" size={11} /> add rack
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>name</th>
                  <th>height</th>
                  <th>zone</th>
                  <th>created</th>
                  {canEdit && <th style={{ width: 72 }} />}
                </tr>
              </thead>
              <tbody>
                {racks.map(rack => (
                  <tr key={rack.id} className="rack-row">
                    <td className="pri">{rack.name}</td>
                    <td>{rack.uHeight}U</td>
                    <td style={{ color: rack.zoneId ? undefined : 'var(--text3, #4e5560)' }}>
                      {getZoneName(rack.zoneId)}
                    </td>
                    <td>{new Date(rack.createdAt).toLocaleDateString()}</td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            className="rack-action-btn"
                            onClick={() => setRackModal({ open: true, rack })}
                            title="Edit rack"
                            style={{
                              background: 'none', border: 'none',
                              color: 'var(--text3, #4e5560)', cursor: 'pointer',
                              padding: '2px 4px', borderRadius: 3,
                              display: 'flex', alignItems: 'center',
                              transition: 'color 0.1s',
                            }}
                          >
                            <Icon name="edit" size={13} />
                          </button>
                          <button
                            className="rack-action-btn"
                            onClick={() => setDeleteModal({ open: true, rack })}
                            title="Delete rack"
                            style={{
                              background: 'none', border: 'none',
                              color: 'var(--text3, #4e5560)', cursor: 'pointer',
                              padding: '2px 4px', borderRadius: 3,
                              display: 'flex', alignItems: 'center',
                              transition: 'color 0.1s',
                            }}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {site && (
        <>
          <RackFormModal
            open={rackModal.open}
            onClose={() => setRackModal({ open: false, rack: null })}
            initial={rackModal.rack}
            siteId={site.id}
            accent={accent}
            zones={zones}
            onSaved={handleRackSaved}
          />
          <DeleteRackModal
            open={deleteModal.open}
            onClose={() => setDeleteModal({ open: false, rack: null })}
            rack={deleteModal.rack}
            siteId={site.id}
            onDeleted={handleRackDeleted}
          />
        </>
      )}
    </div>
  );
}
