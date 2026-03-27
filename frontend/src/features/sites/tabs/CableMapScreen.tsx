import { useState, useEffect } from 'react';
import { useOutletContext }    from 'react-router-dom';
import { useRackStore }        from '../../../store/useRackStore';
import { useTypesStore }       from '../../../store/useTypesStore';
import { useThemeStore, OS_THEME_TOKENS, themeToVars } from '../../../store/useThemeStore';
import { api }                 from '../../../utils/api';
import { EmptyState }          from '../../../components/ui/EmptyState';
import type { SiteCtx }        from '../../SiteShell';
import type { Connection, CableType, DeviceInstance } from '@werkstack/shared';
import { PatchWizard }         from './cable_map/PatchWizard';

// ── Medium mismatch helpers ───────────────────────────────────────────────────
const FIBER_TYPES  = new Set(['sfp', 'sfp+', 'sfp28', 'qsfp', 'qsfp28']);
const COPPER_TYPES = new Set(['rj45']);

function getPortMedium(blockType?: string): string {
  if (!blockType) return 'unknown';
  if (FIBER_TYPES.has(blockType))  return 'fiber';
  if (COPPER_TYPES.has(blockType)) return 'copper';
  return 'other';
}

function hasMediumMismatch(srcType?: string, dstType?: string): boolean {
  const src = getPortMedium(srcType);
  const dst = getPortMedium(dstType);
  if (src === 'unknown' || dst === 'unknown') return false;
  if (src === 'other'   || dst === 'other')   return false;
  return src !== dst;
}

// ── Enriched row type ─────────────────────────────────────────────────────────
interface ConnRow extends Connection {
  srcName:        string;
  dstName:        string;
  cableTypeName?: string;
  cableTypeColor?: string;
  mismatch:       boolean;
}

function enrichConnections(
  conns: Connection[],
  devices: DeviceInstance[],
  cableTypes: CableType[]
): ConnRow[] {
  const deviceMap  = new Map(devices.map(d => [d.id, d]));
  const cableMap   = new Map(cableTypes.map(c => [c.id, c]));
  return conns.map(c => ({
    ...c,
    srcName:        deviceMap.get(c.srcDeviceId)?.name ?? 'unknown device',
    dstName:        deviceMap.get(c.dstDeviceId)?.name ?? 'unknown device',
    cableTypeName:  c.cableTypeId ? cableMap.get(c.cableTypeId)?.name  : undefined,
    cableTypeColor: c.cableTypeId ? cableMap.get(c.cableTypeId)?.color : undefined,
    mismatch:       hasMediumMismatch(c.srcBlockType, c.dstBlockType),
  }));
}

export function CableMapScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;

  const osTheme = useThemeStore(s => s.osTheme);
  const th      = OS_THEME_TOKENS[osTheme];
  const thVars  = themeToVars(th) as React.CSSProperties;

  const devices    = useRackStore(s => s.devices);
  const cableTypes = useTypesStore(s => s.cableTypes);

  const [conns,    setConns]    = useState<Connection[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [wizard,   setWizard]   = useState<{ open: boolean; initial?: Connection }>({ open: false });
  const [deleting, setDeleting] = useState<string | null>(null);

  // Cable type filter — null = all, Set = specific types
  const [cableFilter, setCableFilter] = useState<Set<string> | null>(null);
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const siteId  = site?.id ?? '';
  const apiBase = `/api/sites/${siteId}`;

  useEffect(() => {
    if (!site) return;
    setLoading(true);
    api.get<Connection[]>(`${apiBase}/connections`)
      .then(data => setConns(data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [site?.id]);

  const rows = enrichConnections(conns, devices, cableTypes);

  // Filter
  const visible = rows.filter(r => {
    if (mismatchOnly && !r.mismatch) return false;
    if (cableFilter !== null) {
      // null cableTypeId → only show if null is in filter? treat as 'none'
      const id = r.cableTypeId ?? 'none';
      if (!cableFilter.has(id)) return false;
    }
    return true;
  });

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await api.delete(`${apiBase}/connections/${id}`);
      setConns(p => p.filter(c => c.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  }

  function handleSave(conn: Connection) {
    setConns(p => {
      const idx = p.findIndex(c => c.id === conn.id);
      if (idx >= 0) {
        const next = [...p];
        next[idx] = conn;
        return next;
      }
      return [...p, conn];
    });
  }

  // Build unique cable type IDs present in current rows for filter pills
  const presentCableIds = Array.from(new Set(rows.map(r => r.cableTypeId ?? 'none')));

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      ...av, ...(css.vars as React.CSSProperties), ...thVars,
      background: th.pageBg, color: th.text,
    }}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .cm-row:hover td { background: ${th.rowBg} !important; }
        .cm-act:hover { color: ${th.text} !important; }
        .cm-del:hover { color: ${th.red} !important; }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', height: 38, flexShrink: 0,
        background: th.hdrBg, borderBottom: `1px solid ${th.hdrBorder}`,
      }}>
        <span style={{ fontFamily: th.fontMain, fontSize: 12, color: th.text, marginRight: 8 }}>
          cable_map
        </span>
        <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginRight: 4 }}>
          filter:
        </span>

        {/* All pill */}
        <button
          className={`rpill${cableFilter === null && !mismatchOnly ? ' on' : ''}`}
          style={{ background: cableFilter === null && !mismatchOnly ? accent : undefined, color: cableFilter === null && !mismatchOnly ? '#0c0d0e' : undefined }}
          onClick={() => { setCableFilter(null); setMismatchOnly(false); }}
        >all</button>

        {/* Cable type pills */}
        {presentCableIds.map(cid => {
          const ct = cableTypes.find(c => c.id === cid);
          const isOn = cableFilter !== null && cableFilter.has(cid) && !mismatchOnly;
          return (
            <button
              key={cid}
              className={`rpill${isOn ? ' on' : ''}`}
              style={isOn ? { background: ct?.color ?? accent, color: '#0c0d0e', borderColor: ct?.color ?? accent } : {}}
              onClick={() => {
                setMismatchOnly(false);
                setCableFilter(prev => {
                  if (prev === null) return new Set([cid]);
                  const next = new Set(prev);
                  if (next.has(cid)) {
                    next.delete(cid);
                    return next.size === 0 ? null : next;
                  }
                  next.add(cid);
                  return next;
                });
              }}
            >{ct?.name ?? 'no cable'}</button>
          );
        })}

        {/* Mismatch filter */}
        {rows.some(r => r.mismatch) && (
          <button
            className={`rpill${mismatchOnly ? ' on' : ''}`}
            style={mismatchOnly ? { background: th.red, color: '#0c0d0e', borderColor: th.red } : { color: th.red, borderColor: th.red }}
            onClick={() => { setMismatchOnly(p => !p); setCableFilter(null); }}
          >⚠ mismatch</button>
        )}

        <div style={{ flex: 1 }} />

        <button
          className="act-primary"
          style={{
            padding: '4px 12px', borderRadius: 4,
            background: accent, color: '#0c0d0e',
            fontFamily: th.fontLabel, fontSize: 11,
            border: `1px solid ${accent}`,
          }}
          onClick={() => setWizard({ open: true })}
        >+ new connection</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ padding: 32, fontFamily: th.fontData, fontSize: 11, color: th.text3 }}>loading…</div>
        ) : conns.length === 0 ? (
          <EmptyState
            icon="layers"
            title="no connections yet"
            subtitle="Document physical cable connections between device ports"
            action={
              <button
                className="act-primary"
                style={{ padding: '5px 14px', borderRadius: 4, background: accent, color: '#0c0d0e', border: `1px solid ${accent}`, fontFamily: th.fontLabel, fontSize: 11 }}
                onClick={() => setWizard({ open: true })}
              >+ new connection</button>
            }
          />
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, fontFamily: th.fontData, fontSize: 11, color: th.text3 }}>
            no connections match filter
          </div>
        ) : (
          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontFamily: th.fontData, fontSize: 12,
          }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${th.border2}` }}>
                {['source', 'cable', 'destination', 'label', '', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '6px 10px', textAlign: 'left',
                    fontFamily: th.fontLabel, fontSize: 10, color: th.text3,
                    fontWeight: 500, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(row => (
                <tr key={row.id} className="cm-row">
                  {/* Source */}
                  <td style={{ padding: '7px 10px', color: th.text }}>
                    <span style={{ color: accent }}>{row.srcName}</span>
                    {row.srcPort && (
                      <span style={{ color: th.text3 }}> : {row.srcPort}</span>
                    )}
                  </td>
                  {/* Cable type */}
                  <td style={{ padding: '7px 10px' }}>
                    {row.cableTypeName ? (
                      <span style={{
                        padding: '2px 8px', borderRadius: 999,
                        background: row.cableTypeColor ?? th.border2,
                        color: '#0c0d0e',
                        fontFamily: th.fontLabel, fontSize: 10,
                      }}>{row.cableTypeName}</span>
                    ) : (
                      <span style={{ color: th.text3, fontSize: 10 }}>—</span>
                    )}
                  </td>
                  {/* Destination */}
                  <td style={{ padding: '7px 10px', color: th.text }}>
                    <span style={{ color: accent }}>{row.dstName}</span>
                    {row.dstPort && (
                      <span style={{ color: th.text3 }}> : {row.dstPort}</span>
                    )}
                  </td>
                  {/* Label */}
                  <td style={{ padding: '7px 10px', color: th.text2 }}>
                    {row.label ?? ''}
                  </td>
                  {/* Mismatch warning */}
                  <td style={{ padding: '7px 6px', width: 24 }}>
                    {row.mismatch && (
                      <span title="Medium mismatch: fiber port connected to copper port" style={{ color: th.red, fontSize: 13 }}>⚠</span>
                    )}
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '7px 6px', whiteSpace: 'nowrap' }}>
                    <button
                      className="cm-act"
                      style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginRight: 8 }}
                      onClick={() => setWizard({ open: true, initial: row })}
                    >edit</button>
                    <button
                      className="cm-del"
                      disabled={deleting === row.id}
                      style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}
                      onClick={() => handleDelete(row.id)}
                    >{deleting === row.id ? '…' : 'delete'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stats footer */}
      {conns.length > 0 && (
        <div style={{
          padding: '6px 16px', borderTop: `1px solid ${th.border}`,
          fontFamily: th.fontLabel, fontSize: 10, color: th.text3,
          display: 'flex', gap: 16,
        }}>
          <span>{conns.length} connection{conns.length !== 1 ? 's' : ''}</span>
          {rows.filter(r => r.mismatch).length > 0 && (
            <span style={{ color: th.red }}>
              ⚠ {rows.filter(r => r.mismatch).length} mismatch{rows.filter(r => r.mismatch).length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
      )}

      {wizard.open && (
        <PatchWizard
          siteId={siteId}
          initial={wizard.initial}
          onSave={handleSave}
          onClose={() => setWizard({ open: false })}
        />
      )}
    </div>
  );
}
