import { useState, useEffect } from 'react';
import { Modal }      from '../../../../components/ui/Modal';
import { Icon }       from '../../../../components/ui/Icon';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { useCan }     from '../../../../utils/can';
import { api }        from '../../../../utils/api';
import type { Share, StoragePool, ShareProtocol } from '@werkstack/shared';

// ── Protocol badge colors ─────────────────────────────────────────────────────

const PROTO_COLOR: Record<ShareProtocol, string> = {
  smb:   '#4a8fc4',
  nfs:   '#4ac48a',
  iscsi: '#c47c5a',
};

// ── ShareModal ────────────────────────────────────────────────────────────────

interface ShareDraft {
  poolId:   string;
  name:     string;
  protocol: ShareProtocol;
  path:     string;
  notes:    string;
}

function blank(): ShareDraft {
  return { poolId: '', name: '', protocol: 'smb', path: '', notes: '' };
}

interface ShareModalProps {
  open:     boolean;
  onClose:  () => void;
  initial:  Share | null;
  pools:    StoragePool[];
  siteId:   string;
  accent:   string;
  av:       React.CSSProperties;
  onSaved:  (s: Share) => void;
}

function ShareModal({ open, onClose, initial, pools, siteId, accent: _accent, av, onSaved }: ShareModalProps) {
  const [f, setF]       = useState<ShareDraft>(blank());
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  useEffect(() => {
    if (!open) return;
    setErr(''); setBusy(false);
    setF(initial
      ? {
          poolId:   initial.poolId ?? '',
          name:     initial.name,
          protocol: initial.protocol,
          path:     initial.path ?? '',
          notes:    initial.notes ?? '',
        }
      : blank()
    );
  }, [open, initial]);

  const set = <K extends keyof ShareDraft>(k: K, v: ShareDraft[K]) =>
    setF(p => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setErr('name is required'); return; }
    setBusy(true); setErr('');
    try {
      const payload = {
        poolId:   f.poolId || undefined,
        name:     f.name.trim(),
        protocol: f.protocol,
        path:     f.path || undefined,
        notes:    f.notes || undefined,
      };
      const result: Share = initial
        ? await api.patch(`/api/sites/${siteId}/shares/${initial.id}`, payload)
        : await api.post(`/api/sites/${siteId}/shares`, payload);
      onSaved(result);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to save share');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'edit share' : 'add share'}
      minWidth={460}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--red, #c07070)', flex: 1 }}>
              {err}
            </span>
          )}
          <button className="btn-ghost" onClick={onClose} disabled={busy}>cancel</button>
          <button type="submit" form="share-form" className="act-primary" style={av} disabled={busy}>
            {busy ? 'saving…' : (initial ? 'save' : 'add share')}
          </button>
        </div>
      }
    >
      <form id="share-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="wiz-grid2">
          {/* Name */}
          <div className="wiz-field">
            <label className="wiz-label">name *</label>
            <input
              className="wiz-input"
              value={f.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. media, backups, data"
              autoFocus
            />
          </div>
          {/* Protocol */}
          <div className="wiz-field">
            <label className="wiz-label">protocol *</label>
            <select className="wiz-input" value={f.protocol} onChange={e => set('protocol', e.target.value as ShareProtocol)}>
              <option value="smb">SMB / Samba</option>
              <option value="nfs">NFS</option>
              <option value="iscsi">iSCSI</option>
            </select>
          </div>
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

        {/* Path */}
        <div className="wiz-field">
          <label className="wiz-label">path</label>
          <input
            className="wiz-input"
            value={f.path}
            onChange={e => set('path', e.target.value)}
            placeholder={f.protocol === 'iscsi' ? 'e.g. iqn.2024-01.com.example:target' : 'e.g. /tank/data'}
          />
        </div>

        {/* Notes */}
        <div className="wiz-field">
          <label className="wiz-label">notes</label>
          <textarea
            className="wiz-input"
            value={f.notes}
            onChange={e => set('notes', e.target.value)}
            rows={2}
            style={{ resize: 'vertical' }}
          />
        </div>
      </form>
    </Modal>
  );
}

// ── DeleteShareModal ──────────────────────────────────────────────────────────

interface DeleteShareModalProps {
  open:      boolean;
  onClose:   () => void;
  share:     Share | null;
  siteId:    string;
  onDeleted: (id: string) => void;
}

function DeleteShareModal({ open, onClose, share, siteId, onDeleted }: DeleteShareModalProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  useEffect(() => { if (open) { setBusy(false); setErr(''); } }, [open]);

  async function handleDelete() {
    if (!share) return;
    setBusy(true); setErr('');
    try {
      await api.delete(`/api/sites/${siteId}/shares/${share.id}`);
      onDeleted(share.id);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to delete share');
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="delete share" minWidth={400}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--red, #c07070)', flex: 1 }}>{err}</span>}
          <button className="btn-ghost" onClick={onClose} disabled={busy}>cancel</button>
          <button className="confirm-danger-btn" onClick={handleDelete} disabled={busy}>
            {busy ? 'deleting…' : 'delete share'}
          </button>
        </div>
      }
    >
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: 'var(--text2, #8a9299)', lineHeight: 1.5 }}>
        Delete share{' '}
        <span style={{ color: 'var(--text, #d4d9dd)', fontWeight: 600 }}>{share?.name}</span>?
        This action cannot be undone.
      </div>
    </Modal>
  );
}

// ── StorageSharesTab ──────────────────────────────────────────────────────────

interface Props {
  shares:        Share[];
  pools:         StoragePool[];
  siteId:        string;
  accent:        string;
  av:            React.CSSProperties;
  onShareAdd:    (s: Share) => void;
  onShareUpdate: (s: Share) => void;
  onShareDelete: (id: string) => void;
}

export function StorageSharesTab({
  shares, pools, siteId, accent, av,
  onShareAdd, onShareUpdate, onShareDelete,
}: Props) {
  const { can } = useCan();
  const canEdit = can('storage', 'write');

  const [modal, setModal]     = useState<{ open: boolean; share: Share | null }>({ open: false, share: null });
  const [delModal, setDelModal] = useState<{ open: boolean; share: Share | null }>({ open: false, share: null });

  const poolById = new Map(pools.map(p => [p.id, p]));

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'Ubuntu', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--text, #d4d9dd)' }}>
            shares
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)', marginTop: 2 }}>
            {shares.length} share{shares.length !== 1 ? 's' : ''}
          </div>
        </div>
        {canEdit && (
          <button className="act-primary" style={av} onClick={() => setModal({ open: true, share: null })}>
            <Icon name="plus" size={11} /> add share
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--cardBg, #141618)',
        border: '1px solid var(--border2, #262c30)',
        borderRadius: 8, overflow: 'hidden',
      }}>
        {shares.length === 0 ? (
          <div style={{ padding: '8px 0' }}>
            <EmptyState
              icon="storage"
              title="no shares yet"
              subtitle={canEdit ? 'Add SMB, NFS, or iSCSI shares to document your exports.' : 'No shares have been created.'}
              action={canEdit ? (
                <button className="act-primary" style={av} onClick={() => setModal({ open: true, share: null })}>
                  <Icon name="plus" size={11} /> add share
                </button>
              ) : undefined}
            />
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>protocol</th>
                <th>name</th>
                <th>pool</th>
                <th>path</th>
                <th>created</th>
                {canEdit && <th style={{ width: 72 }} />}
              </tr>
            </thead>
            <tbody>
              {shares.map(share => {
                const pool = share.poolId ? poolById.get(share.poolId) : undefined;
                return (
                  <tr key={share.id} className="st-row">
                    <td>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                        color: PROTO_COLOR[share.protocol],
                        background: `${PROTO_COLOR[share.protocol]}22`,
                        border: `1px solid ${PROTO_COLOR[share.protocol]}44`,
                        borderRadius: 3, padding: '2px 6px',
                        textTransform: 'uppercase',
                      }}>
                        {share.protocol}
                      </span>
                    </td>
                    <td className="pri">{share.name}</td>
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
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
                      {share.path || '—'}
                    </td>
                    <td>{new Date(share.createdAt).toLocaleDateString()}</td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="st-act-btn" onClick={() => setModal({ open: true, share })}
                            style={{ background: 'none', border: 'none', color: 'var(--text3, #4e5560)', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, display: 'flex', alignItems: 'center', transition: 'color 0.1s' }}>
                            <Icon name="edit" size={13} />
                          </button>
                          <button className="st-act-btn" onClick={() => setDelModal({ open: true, share })}
                            style={{ background: 'none', border: 'none', color: 'var(--text3, #4e5560)', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, display: 'flex', alignItems: 'center', transition: 'color 0.1s' }}>
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

      <ShareModal
        open={modal.open}
        onClose={() => setModal({ open: false, share: null })}
        initial={modal.share}
        pools={pools}
        siteId={siteId}
        accent={accent}
        av={av}
        onSaved={s => (modal.share ? onShareUpdate(s) : onShareAdd(s))}
      />
      <DeleteShareModal
        open={delModal.open}
        onClose={() => setDelModal({ open: false, share: null })}
        share={delModal.share}
        siteId={siteId}
        onDeleted={onShareDelete}
      />
    </div>
  );
}
