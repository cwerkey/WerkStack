import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useParams }     from 'react-router-dom';
import { Modal }            from '../../../components/ui/Modal';
import { EmptyState }       from '../../../components/ui/EmptyState';
import { ErrorBoundary }    from '../../../components/ui/ErrorBoundary';
import { api }              from '../../../utils/api';
import type { SiteCtx }     from '../../SiteShell';
import type { LedgerItem, LedgerTransaction, LedgerCategory, LedgerAction } from '@werkstack/shared';

const CATEGORIES: LedgerCategory[] = ['ram', 'cpu', 'drive', 'cable', 'psu', 'fan', 'pcie-card', 'misc'];

// ── LedgerScreen ─────────────────────────────────────────────────────────────

export function LedgerScreen() {
  const { accent, css } = useOutletContext<SiteCtx>();
  const { siteId }      = useParams<{ siteId: string }>();
  const av = { '--accent': accent } as React.CSSProperties;

  const [items, setItems]           = useState<LedgerItem[]>([]);
  const [transactions, setTxs]      = useState<LedgerTransaction[]>([]);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState('');
  const [editItem, setEditItem]     = useState<LedgerItem | null>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [showTx, setShowTx]         = useState<string | null>(null);
  const [catFilter, setCatFilter]   = useState<Set<string> | null>(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setErr('');
    try {
      const [i, t] = await Promise.all([
        api.get<LedgerItem[]>(`/api/sites/${siteId}/ledger`),
        api.get<LedgerTransaction[]>(`/api/sites/${siteId}/ledger/transactions`),
      ]);
      setItems(i!);
      setTxs(t!);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const visible = items.filter(x => catFilter === null || catFilter.has(x.category));

  const deleteItem = async (id: string) => {
    try {
      await api.delete(`/api/sites/${siteId}/ledger/${id}`);
      setItems(prev => prev.filter(x => x.id !== id));
    } catch { /* handled by api */ }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
      `}</style>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 40px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13, fontWeight: 700,
            color: 'var(--text, #d4d9dd)',
          }}>
            resource ledger
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="act-primary" onClick={() => setShowAdd(true)}
              style={{
                background: accent, border: 'none', borderRadius: 4,
                padding: '4px 12px', color: '#fff',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                fontWeight: 700, cursor: 'pointer',
              }}>
              + add item
            </button>
            <button className="btn-ghost" onClick={load}
              style={{ fontSize: 11, padding: '4px 12px', borderRadius: 4 }}>
              refresh
            </button>
          </div>
        </div>

        {err && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--red, #c07070)', marginBottom: 12,
          }}>{err}</div>
        )}

        {/* Category filter */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className={`rpill${catFilter === null ? ' on' : ''}`}
            onClick={() => setCatFilter(catFilter === null ? new Set() : null)}
            style={{ fontSize: 10, padding: '2px 8px' }}>
            all
          </button>
          {CATEGORIES.map(c => {
            const isOn = catFilter === null || catFilter.has(c);
            return (
              <button key={c}
                className={`rpill${isOn && catFilter !== null ? ' on' : ''}`}
                onClick={() => {
                  if (catFilter === null) {
                    setCatFilter(new Set(CATEGORIES.filter(x => x !== c)));
                  } else {
                    const next = new Set(catFilter);
                    if (next.has(c)) next.delete(c); else next.add(c);
                    if (next.size === CATEGORIES.length) setCatFilter(null);
                    else setCatFilter(next);
                  }
                }}
                style={{ fontSize: 10, padding: '2px 8px' }}>
                {c}
              </button>
            );
          })}
        </div>

        {!loading && visible.length === 0 && (
          <EmptyState icon="layers" title="no ledger items"
            action={
              <button className="act-primary" onClick={() => setShowAdd(true)}
                style={{
                  background: 'var(--accent)', border: 'none', borderRadius: 4,
                  padding: '5px 12px', color: '#fff',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  fontWeight: 700, cursor: 'pointer',
                }}>
                + add your first component
              </button>
            }
          />
        )}

        {/* Items table */}
        {visible.length > 0 && (
          <ErrorBoundary>
          <div style={{
            background: 'var(--cardBg, #141618)',
            border: '1px solid var(--border, #1d2022)',
            borderRadius: 8, overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, color: 'var(--text3, #4e5560)',
                  textAlign: 'left',
                }}>
                  <th style={{ padding: '8px 12px' }}>name</th>
                  <th style={{ padding: '8px 12px' }}>category</th>
                  <th style={{ padding: '8px 12px' }}>sku</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>qty</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>reserved</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>available</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>unit cost</th>
                  <th style={{ padding: '8px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(item => (
                  <tr key={item.id} style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11, color: 'var(--text, #d4d9dd)',
                    borderTop: '1px solid var(--border, #1d2022)',
                    cursor: 'pointer',
                  }}>
                    <td style={{ padding: '6px 12px' }}>{item.name}</td>
                    <td style={{ padding: '6px 12px' }}>
                      <span style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 3,
                        background: 'var(--inputBg, #1a1d20)',
                        color: 'var(--text2, #8a9299)',
                      }}>
                        {item.category}
                      </span>
                    </td>
                    <td style={{ padding: '6px 12px', color: 'var(--text3, #4e5560)' }}>
                      {item.sku || '—'}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>{item.quantity}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--gold, #b89870)' }}>
                      {item.reserved}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right',
                      color: item.quantity - item.reserved <= 0 ? 'var(--red, #c07070)' : 'var(--green, #70b870)',
                    }}>
                      {item.quantity - item.reserved}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--text3, #4e5560)' }}>
                      {item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn-ghost" onClick={() => setShowTx(item.id)}
                          style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3 }}>
                          tx
                        </button>
                        <button className="btn-ghost" onClick={() => setEditItem(item)}
                          style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3 }}>
                          edit
                        </button>
                        <button className="btn-ghost" onClick={() => deleteItem(item.id)}
                          style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, color: 'var(--red, #c07070)' }}>
                          del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </ErrorBoundary>
        )}

        {/* Recent transactions */}
        {transactions.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700,
              color: 'var(--text2, #8a9299)',
              marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              recent transactions
            </div>
            <div style={{
              background: 'var(--cardBg, #141618)',
              border: '1px solid var(--border, #1d2022)',
              borderRadius: 8, padding: 12,
              maxHeight: 200, overflowY: 'auto',
            }}>
              {transactions.slice(0, 20).map(tx => {
                const item = items.find(i => i.id === tx.ledgerItemId);
                return (
                  <div key={tx.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '3px 0',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: 'var(--text, #d4d9dd)',
                  }}>
                    <span style={{
                      fontSize: 9, padding: '1px 4px', borderRadius: 2,
                      background: tx.action === 'add' || tx.action === 'uninstall'
                        ? '#70b87020' : tx.action === 'remove' || tx.action === 'install'
                        ? '#c0707020' : '#b8987020',
                      color: tx.action === 'add' || tx.action === 'uninstall'
                        ? 'var(--green, #70b870)' : tx.action === 'remove' || tx.action === 'install'
                        ? 'var(--red, #c07070)' : 'var(--gold, #b89870)',
                    }}>
                      {tx.action}
                    </span>
                    <span>×{tx.quantity}</span>
                    <span style={{ color: 'var(--text2, #8a9299)' }}>{item?.name ?? tx.ledgerItemId.slice(0, 8)}</span>
                    {tx.note && <span style={{ color: 'var(--text3, #4e5560)' }}>— {tx.note}</span>}
                    <span style={{ marginLeft: 'auto', color: 'var(--text3, #4e5560)' }}>
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Item Modal */}
      {(showAdd || editItem) && (
        <LedgerItemModal
          siteId={siteId!}
          initial={editItem}
          onClose={() => { setShowAdd(false); setEditItem(null); }}
          onSaved={load}
        />
      )}

      {/* Transaction Modal */}
      {showTx && (
        <TransactionModal
          siteId={siteId!}
          itemId={showTx}
          itemName={items.find(i => i.id === showTx)?.name ?? ''}
          onClose={() => setShowTx(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── LedgerItemModal ──────────────────────────────────────────────────────────

interface LedgerItemModalProps {
  siteId:  string;
  initial: LedgerItem | null;
  onClose: () => void;
  onSaved: () => void;
}

function LedgerItemModal({ siteId, initial, onClose, onSaved }: LedgerItemModalProps) {
  type Draft = { name: string; category: LedgerCategory; sku: string; quantity: number; unitCost: string; notes: string };
  const blank: Draft = { name: '', category: 'misc', sku: '', quantity: 0, unitCost: '', notes: '' };

  const [f, setF] = useState<Draft>(initial ? {
    name: initial.name, category: initial.category,
    sku: initial.sku ?? '', quantity: initial.quantity,
    unitCost: initial.unitCost != null ? String(initial.unitCost) : '', notes: initial.notes ?? '',
  } : blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const payload = {
        name: f.name, category: f.category,
        sku: f.sku || undefined, quantity: f.quantity,
        unitCost: f.unitCost ? parseFloat(f.unitCost) : undefined,
        notes: f.notes || undefined,
      };
      if (initial) {
        await api.patch(`/api/sites/${siteId}/ledger/${initial.id}`, payload);
      } else {
        await api.post(`/api/sites/${siteId}/ledger`, payload);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'edit ledger item' : 'add ledger item'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
        <input placeholder="name" value={f.name} onChange={e => set('name', e.target.value)}
          style={{ background: 'var(--inputBg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} />
        <select value={f.category} onChange={e => set('category', e.target.value as LedgerCategory)}
          style={{ background: 'var(--inputBg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="sku (optional)" value={f.sku} onChange={e => set('sku', e.target.value)}
          style={{ background: 'var(--inputBg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} />
        <input type="number" placeholder="quantity" value={f.quantity} onChange={e => set('quantity', parseInt(e.target.value) || 0)}
          style={{ background: 'var(--inputBg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} />
        <input placeholder="unit cost (optional)" value={f.unitCost} onChange={e => set('unitCost', e.target.value)}
          style={{ background: 'var(--inputBg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} />
        <textarea placeholder="notes (optional)" value={f.notes} onChange={e => set('notes', e.target.value)} rows={2}
          style={{ background: 'var(--inputBg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, resize: 'vertical' }} />

        {err && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--red)' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 4 }}>cancel</button>
          <button className="act-primary" onClick={save} disabled={!f.name || busy}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '5px 12px', color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'saving...' : 'save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── TransactionModal ─────────────────────────────────────────────────────────

interface TransactionModalProps {
  siteId:   string;
  itemId:   string;
  itemName: string;
  onClose:  () => void;
  onSaved:  () => void;
}

function TransactionModal({ siteId, itemId, itemName, onClose, onSaved }: TransactionModalProps) {
  const [action, setAction]   = useState<LedgerAction>('add');
  const [qty, setQty]         = useState(1);
  const [note, setNote]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState('');

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.post(`/api/sites/${siteId}/ledger/transactions`, {
        ledgerItemId: itemId,
        action,
        quantity: qty,
        note: note || undefined,
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`transaction: ${itemName}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
        <select value={action} onChange={e => setAction(e.target.value as LedgerAction)}
          style={{ background: 'var(--inputBg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
          {(['add', 'remove', 'reserve', 'unreserve', 'install', 'uninstall'] as const).map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          style={{ background: 'var(--inputBg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} />
        <input placeholder="note (optional)" value={note} onChange={e => setNote(e.target.value)}
          style={{ background: 'var(--inputBg)', border: '1px solid var(--border2)', borderRadius: 4, padding: '5px 10px', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }} />

        {err && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--red)' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 4 }}>cancel</button>
          <button className="act-primary" onClick={submit} disabled={busy}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '5px 12px', color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'submitting...' : 'submit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
