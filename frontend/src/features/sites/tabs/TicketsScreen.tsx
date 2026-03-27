import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useParams }        from 'react-router-dom';
import { Modal }         from '../../../components/ui/Modal';
import { EmptyState }    from '../../../components/ui/EmptyState';
import { Icon }          from '../../../components/ui/Icon';
import { useTypesStore } from '../../../store/useTypesStore';
import { useCan }        from '../../../utils/can';
import { api }           from '../../../utils/api';
import type { SiteCtx }          from '../../SiteShell';
import type { Ticket, TicketCategory } from '@werkstack/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'open' | 'in-progress' | 'closed';

const STATUS_COLORS: Record<string, string> = {
  'open':        'var(--green, #8ab89e)',
  'in-progress': 'var(--gold, #b89870)',
  'closed':      'var(--text3, #4e5560)',
};
const PRIORITY_COLORS: Record<string, string> = {
  'critical': 'var(--red, #c07070)',
  'high':     'var(--gold, #b89870)',
  'normal':   'var(--text2, #8a9299)',
  'low':      'var(--text3, #4e5560)',
};

// ── TicketModal ───────────────────────────────────────────────────────────────

interface TicketModalProps {
  open:       boolean;
  onClose:    () => void;
  initial:    Ticket | null;
  siteId:     string;
  accent:     string;
  categories: TicketCategory[];
  onSaved:    (t: Ticket) => void;
}

type Draft = {
  title:       string;
  description: string;
  status:      Ticket['status'];
  priority:    Ticket['priority'];
  categoryId:  string;
};

const blank: Draft = {
  title: '', description: '', status: 'open', priority: 'normal', categoryId: '',
};

function TicketModal({ open, onClose, initial, siteId, accent, categories, onSaved }: TicketModalProps) {
  const [f,    setF]    = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const av = { '--accent': accent } as React.CSSProperties;

  useEffect(() => {
    if (!open) return;
    setErr('');
    setBusy(false);
    setF(initial
      ? {
          title:       initial.title,
          description: initial.description ?? '',
          status:      initial.status,
          priority:    initial.priority,
          categoryId:  initial.categoryId ?? '',
        }
      : { ...blank }
    );
  }, [open, initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(p => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) { setErr('title is required'); return; }
    setBusy(true);
    setErr('');
    try {
      const payload = {
        title:       f.title.trim(),
        description: f.description.trim() || undefined,
        status:      f.status,
        priority:    f.priority,
        categoryId:  f.categoryId || undefined,
      };
      const result = initial
        ? await api.patch<Ticket>(`/api/sites/${siteId}/tickets/${initial.id}`, payload)
        : await api.post<Ticket>(`/api/sites/${siteId}/tickets`, payload);
      onSaved(result!);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to save ticket');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    background:   'var(--inputBg, #1a1d20)',
    border:       '1px solid var(--border2, #262c30)',
    borderRadius: 4,
    color:        'var(--text, #d4d9dd)',
    fontFamily:   "'JetBrains Mono', monospace",
    fontSize:     12,
    padding:      '5px 10px',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'edit ticket' : 'new ticket'}
      minWidth={480}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize:   10,
              color:      'var(--red, #c07070)',
              flex:       1,
            }}>
              {err}
            </span>
          )}
          <button className="btn-ghost" onClick={onClose}
            style={{ marginLeft: err ? 0 : 'auto', fontSize: 11, padding: '5px 14px' }}>
            cancel
          </button>
          <button
            className="act-primary"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={busy}
            style={{ ...av, fontSize: 11, padding: '5px 14px' }}
          >
            {busy ? 'saving…' : (initial ? 'save' : 'create')}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="wiz-label">title</span>
          <input
            style={inputStyle}
            value={f.title}
            onChange={e => set('title', e.target.value)}
            placeholder="e.g. replace failed PSU in rack-A server"
            autoFocus
          />
        </label>

        {/* Description */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="wiz-label">description</span>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
            value={f.description}
            onChange={e => set('description', e.target.value)}
            placeholder="optional details…"
          />
        </label>

        {/* Status + Priority */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="wiz-label">status</span>
            <select style={inputStyle} value={f.status} onChange={e => set('status', e.target.value as Draft['status'])}>
              <option value="open">open</option>
              <option value="in-progress">in-progress</option>
              <option value="closed">closed</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="wiz-label">priority</span>
            <select style={inputStyle} value={f.priority} onChange={e => set('priority', e.target.value as Draft['priority'])}>
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
          </label>
        </div>

        {/* Category */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="wiz-label">category</span>
          <select style={inputStyle} value={f.categoryId} onChange={e => set('categoryId', e.target.value)}>
            <option value="">— none —</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </form>
    </Modal>
  );
}

// ── TicketsScreen ─────────────────────────────────────────────────────────────

export function TicketsScreen() {
  const { accent, css }    = useOutletContext<SiteCtx>();
  const { siteId }         = useParams<{ siteId: string }>();
  const av = { '--accent': accent } as React.CSSProperties;

  const categories = useTypesStore(s => s.ticketCategories);
  const { can } = useCan();

  const [tickets,      setTickets]      = useState<Ticket[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editing,      setEditing]      = useState<Ticket | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setErr('');
    try {
      const result = await api.get<Ticket[]>(`/api/sites/${siteId}/tickets`);
      setTickets(result ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  function handleSaved(t: Ticket) {
    setTickets(prev =>
      prev.some(x => x.id === t.id)
        ? prev.map(x => x.id === t.id ? t : x)
        : [t, ...prev]
    );
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.delete(`/api/sites/${siteId}/tickets/${id}`);
      setTickets(prev => prev.filter(t => t.id !== id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to delete ticket');
    } finally {
      setDeletingId(null);
    }
  }

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(t: Ticket) {
    setEditing(t);
    setModalOpen(true);
  }

  const visible = statusFilter === 'all'
    ? tickets
    : tickets.filter(t => t.status === statusFilter);

  const catMap = new Map(categories.map(c => [c.id, c]));

  const canWrite  = can('ticket', 'write');
  const canDelete = can('ticket', 'delete');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .ticket-row:hover td { background: var(--rowBg, #0a0c0e) !important; }
        .icon-btn:hover { color: var(--accent, #c47c5a) !important; }
        .del-btn:hover { color: var(--red, #c07070) !important; }
      `}</style>

      {/* Toolbar */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        padding:        '10px 16px',
        borderBottom:   '1px solid var(--border, #1d2022)',
        flexShrink:     0,
      }}>
        <span style={{
          fontFamily:  "'JetBrains Mono', monospace",
          fontSize:    13,
          fontWeight:  700,
          color:       'var(--text, #d4d9dd)',
          marginRight: 8,
        }}>
          tickets
        </span>

        {/* Status filter pills */}
        {(['all', 'open', 'in-progress', 'closed'] as StatusFilter[]).map(s => (
          <button
            key={s}
            className={`rpill${statusFilter === s ? ' on' : ''}`}
            onClick={() => setStatusFilter(s)}
            style={{ fontSize: 10 }}
          >
            {s}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {canWrite && (
          <button
            className="act-primary"
            onClick={openNew}
            style={{ ...av, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 12px' }}
          >
            <Icon name="plus" size={12} />
            new ticket
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {err && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--red, #c07070)', padding: '10px 16px' }}>
            {err}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '32px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text3)' }}>
            loading…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="ticket"
            title={statusFilter === 'all' ? 'no tickets yet' : `no ${statusFilter} tickets`}
            action={canWrite ? (
              <button className="btn-ghost" onClick={openNew} style={{ fontSize: 11, padding: '5px 14px' }}>
                open a ticket
              </button>
            ) : undefined}
          />
        ) : (
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>title</th>
                <th style={{ width: 130 }}>category</th>
                <th style={{ width: 90  }}>priority</th>
                <th style={{ width: 110 }}>status</th>
                <th style={{ width: 110 }}>created</th>
                <th style={{ width: 68  }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(t => {
                const cat = t.categoryId ? catMap.get(t.categoryId) : null;
                return (
                  <tr key={t.id} className="ticket-row">
                    <td className="pri">
                      <button
                        className="icon-btn"
                        onClick={() => canWrite && openEdit(t)}
                        style={{
                          textAlign:  'left',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize:   12,
                          color:      'var(--text, #d4d9dd)',
                          width:      '100%',
                          cursor:     canWrite ? 'pointer' : 'default',
                        }}
                      >
                        {t.title}
                      </button>
                    </td>
                    <td>
                      {cat ? (
                        <span style={{
                          background:   cat.color + '22',
                          border:       `1px solid ${cat.color}44`,
                          borderRadius: 3,
                          padding:      '2px 7px',
                          fontFamily:   "'JetBrains Mono', monospace",
                          fontSize:     10,
                          color:        cat.color,
                        }}>
                          {cat.name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize:   11,
                        color:      PRIORITY_COLORS[t.priority] ?? 'var(--text2)',
                      }}>
                        {t.priority}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize:   11,
                        color:      STATUS_COLORS[t.status] ?? 'var(--text2)',
                      }}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text3)' }}>
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {canWrite && (
                          <button
                            className="icon-btn"
                            onClick={() => openEdit(t)}
                            title="edit"
                            style={{ color: 'var(--text3)', padding: '2px 4px' }}
                          >
                            <Icon name="edit" size={13} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="del-btn"
                            onClick={() => handleDelete(t.id)}
                            disabled={deletingId === t.id}
                            title="delete"
                            style={{ color: 'var(--text3)', padding: '2px 4px' }}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <TicketModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editing}
        siteId={siteId!}
        accent={accent}
        categories={categories}
        onSaved={handleSaved}
      />
    </div>
  );
}
