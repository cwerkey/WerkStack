import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Modal }        from '../../../components/ui/Modal';
import { EmptyState }   from '../../../components/ui/EmptyState';
import { Icon }         from '../../../components/ui/Icon';
import { useSiteStore } from '../../../store/useSiteStore';
import { useCan }       from '../../../utils/can';
import { api }          from '../../../utils/api';
import type { SiteCtx } from '../../SiteShell';
import type { Zone, Site, AuditLogPage } from '@werkstack/shared';
import { GitSyncConfig } from './site_options/GitSyncConfig';

// ── Color presets (same set as LandingPage) ───────────────────────────────────
const PRESET_COLORS = [
  '#c47c5a', '#5a8cc4', '#5ac48c', '#c45a8c',
  '#8c5ac4', '#c4a85a', '#5ac4c4', '#c45a5a',
];

// ── SiteSettingsForm ──────────────────────────────────────────────────────────

interface SiteSettingsFormProps {
  site:    Site;
  accent:  string;
  canEdit: boolean;
}

function SiteSettingsForm({ site, accent: _accent, canEdit }: SiteSettingsFormProps) {
  type Draft = { name: string; location: string; color: string; description: string };

  const [f, setF]       = useState<Draft>({
    name: site.name, location: site.location,
    color: site.color, description: site.description ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr]   = useState('');
  const upsertSite      = useSiteStore(s => s.upsertSite);

  // Reset when site changes (e.g. navigating between sites)
  useEffect(() => {
    setF({
      name: site.name, location: site.location,
      color: site.color, description: site.description ?? '',
    });
    setSaved(false);
    setErr('');
  }, [site.id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setF(p => ({ ...p, [k]: v }));
    setSaved(false);
  };

  const av = { '--accent': f.color } as React.CSSProperties;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !f.location.trim()) {
      setErr('name and location are required');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const payload = {
        name:        f.name.trim(),
        location:    f.location.trim(),
        color:       f.color,
        description: f.description.trim() || undefined,
      };
      const updated = await api.patch<Site>(`/api/sites/${site.id}`, payload);
      upsertSite(updated!);
      setSaved(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .color-swatch-opt:hover { transform: scale(1.15); }
      `}</style>

      <div className="wiz-grid2">
        {/* Name */}
        <div className="wiz-field">
          <label className="wiz-label">name</label>
          <input
            className="wiz-input"
            value={f.name}
            onChange={e => set('name', e.target.value)}
            disabled={!canEdit}
          />
        </div>
        {/* Location */}
        <div className="wiz-field">
          <label className="wiz-label">location</label>
          <input
            className="wiz-input"
            value={f.location}
            onChange={e => set('location', e.target.value)}
            disabled={!canEdit}
          />
        </div>
      </div>

      {/* Color */}
      <div className="wiz-field">
        <label className="wiz-label">accent color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className="color-swatch-opt"
              onClick={() => canEdit && set('color', c)}
              disabled={!canEdit}
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: c, border: `2px solid ${f.color === c ? '#fff' : 'transparent'}`,
                cursor: canEdit ? 'pointer' : 'default', flexShrink: 0,
                transition: 'transform 0.1s, border-color 0.1s',
                opacity: canEdit ? 1 : 0.6,
              }}
            />
          ))}
          <input
            type="text"
            className="wiz-input"
            value={f.color}
            onChange={e => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) set('color', v);
            }}
            style={{ width: 90, flexShrink: 0 }}
            placeholder="#rrggbb"
            maxLength={7}
            disabled={!canEdit}
          />
          <span style={{
            width: 22, height: 22, borderRadius: 4,
            background: /^#[0-9a-fA-F]{6}$/.test(f.color) ? f.color : 'transparent',
            border: '1px solid var(--border2, #262c30)',
            flexShrink: 0,
          }} />
        </div>
      </div>

      {/* Description */}
      <div className="wiz-field">
        <label className="wiz-label">description</label>
        <textarea
          className="wiz-input"
          value={f.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Brief description of this site…"
          rows={3}
          style={{ resize: 'vertical', minHeight: 60 }}
          disabled={!canEdit}
        />
      </div>

      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="act-primary" style={av} type="submit" disabled={busy}>
            {busy ? 'saving…' : 'save settings'}
          </button>
          {saved && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--green, #8ab89e)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Icon name="check" size={12} color="var(--green, #8ab89e)" />
              saved
            </span>
          )}
          {err && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--red, #c07070)',
            }}>
              {err}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

// ── ZoneFormModal ─────────────────────────────────────────────────────────────

interface ZoneFormModalProps {
  open:     boolean;
  onClose:  () => void;
  initial:  Zone | null;
  siteId:   string;
  accent:   string;
  onSaved:  (z: Zone) => void;
}

function ZoneFormModal({ open, onClose, initial, siteId, accent, onSaved }: ZoneFormModalProps) {
  type Draft = { name: string; description: string };
  const [f, setF]     = useState<Draft>({ name: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  const av = { '--accent': accent } as React.CSSProperties;

  useEffect(() => {
    if (!open) return;
    setErr('');
    setBusy(false);
    setF(initial
      ? { name: initial.name, description: initial.description ?? '' }
      : { name: '', description: '' }
    );
  }, [open, initial]);

  const set = (k: keyof Draft, v: string) =>
    setF(p => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setErr('name is required'); return; }
    setBusy(true);
    setErr('');
    try {
      const payload = {
        name:        f.name.trim(),
        description: f.description.trim() || undefined,
      };
      const result = initial
        ? await api.patch<Zone>(`/api/sites/${siteId}/zones/${initial.id}`, payload)
        : await api.post<Zone>(`/api/sites/${siteId}/zones`, payload);
      onSaved(result!);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to save zone');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'edit zone' : 'add zone'}
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
            form="zone-form"
            className="act-primary"
            style={av}
            disabled={busy}
          >
            {busy ? 'saving…' : (initial ? 'save' : 'add zone')}
          </button>
        </div>
      }
    >
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
      `}</style>
      <form id="zone-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="wiz-field">
          <label className="wiz-label">name *</label>
          <input
            className="wiz-input"
            value={f.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Server Room, Network Closet, Office"
            autoFocus
          />
        </div>
        <div className="wiz-field">
          <label className="wiz-label">description (optional)</label>
          <textarea
            className="wiz-input"
            value={f.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Brief description of this zone…"
            rows={2}
            style={{ resize: 'vertical' }}
          />
        </div>
      </form>
    </Modal>
  );
}

// ── DeleteZoneModal ───────────────────────────────────────────────────────────

interface DeleteZoneModalProps {
  open:      boolean;
  onClose:   () => void;
  zone:      Zone | null;
  siteId:    string;
  onDeleted: (id: string) => void;
}

function DeleteZoneModal({ open, onClose, zone, siteId, onDeleted }: DeleteZoneModalProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  useEffect(() => {
    if (open) { setBusy(false); setErr(''); }
  }, [open]);

  async function handleDelete() {
    if (!zone) return;
    setBusy(true);
    setErr('');
    try {
      await api.delete(`/api/sites/${siteId}/zones/${zone.id}`);
      onDeleted(zone.id);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to delete zone');
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="delete zone"
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
            {busy ? 'deleting…' : 'delete zone'}
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
        Delete zone <span style={{ color: 'var(--text, #d4d9dd)', fontWeight: 600 }}>
          {zone?.name}
        </span>? Any racks and devices in this zone will also be removed.
        This action cannot be undone.
      </div>
    </Modal>
  );
}

// ── AuditLogSection ──────────────────────────────────────────────────────────

function AuditLogSection({ siteId }: { siteId: string }) {
  const [page, setPage]     = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await api.get<AuditLogPage>(
        `/api/sites/${siteId}/audit-log?limit=${limit}&offset=${offset}`
      );
      setPage(data!);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [siteId, offset]);

  useEffect(() => { load(); }, [load]);

  const total = page?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div style={{
      background: 'var(--cardBg, #141618)',
      border: '1px solid var(--border2, #262c30)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border, #1d2022)',
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, fontWeight: 700,
          color: 'var(--text2, #8a9299)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          flex: 1,
        }}>
          audit log {total > 0 ? `(${total})` : ''}
        </span>
        <button className="btn-ghost" onClick={load}
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4 }}>
          refresh
        </button>
      </div>

      {loading && (
        <div style={{
          padding: '16px 14px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: 'var(--text3, #4e5560)',
        }}>
          loading…
        </div>
      )}

      {err && (
        <div style={{
          padding: '16px 14px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: 'var(--red, #c07070)',
        }}>
          {err}
        </div>
      )}

      {!loading && page && page.entries.length === 0 && (
        <div style={{
          padding: '16px 14px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: 'var(--text3, #4e5560)',
        }}>
          no audit events yet
        </div>
      )}

      {!loading && page && page.entries.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>time</th>
                <th>actor</th>
                <th>action</th>
                <th>resource</th>
              </tr>
            </thead>
            <tbody>
              {page.entries.map(e => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--text3, #4e5560)', whiteSpace: 'nowrap' }}>
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td style={{ color: 'var(--text2, #8a9299)' }}>
                    {e.actorEmail ?? '—'}
                  </td>
                  <td className="pri">{e.action}</td>
                  <td style={{ color: 'var(--text3, #4e5560)' }}>
                    {e.resource ? `${e.resource}${e.resourceId ? ` / ${e.resourceId.slice(0, 8)}…` : ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {(hasPrev || hasNext) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px',
              borderTop: '1px solid var(--border, #1d2022)',
            }}>
              <button className="btn-ghost" onClick={() => setOffset(o => o - limit)}
                disabled={!hasPrev}
                style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, opacity: hasPrev ? 1 : 0.4 }}>
                prev
              </button>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, color: 'var(--text3, #4e5560)', flex: 1, textAlign: 'center',
              }}>
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button className="btn-ghost" onClick={() => setOffset(o => o + limit)}
                disabled={!hasNext}
                style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, opacity: hasNext ? 1 : 0.4 }}>
                next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── SiteOptionsScreen ─────────────────────────────────────────────────────────

export function SiteOptionsScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;
  const { can } = useCan();
  const canEdit = can('site', 'write');

  // Zones state
  const [zones, setZones]           = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonesErr, setZonesErr]     = useState('');

  // Zone modal state
  const [zoneModal, setZoneModal] = useState<{ open: boolean; zone: Zone | null }>({
    open: false, zone: null,
  });
  const [deleteZoneModal, setDeleteZoneModal] = useState<{ open: boolean; zone: Zone | null }>({
    open: false, zone: null,
  });

  const loadZones = useCallback(async () => {
    if (!site) return;
    setZonesLoading(true);
    setZonesErr('');
    try {
      const data = await api.get<Zone[]>(`/api/sites/${site.id}/zones`);
      setZones(data ?? []);
    } catch (e: unknown) {
      setZonesErr(e instanceof Error ? e.message : 'failed to load zones');
    } finally {
      setZonesLoading(false);
    }
  }, [site?.id]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  function handleZoneSaved(z: Zone) {
    setZones(prev => {
      const idx = prev.findIndex(x => x.id === z.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = z;
        return next;
      }
      return [...prev, z];
    });
  }

  function handleZoneDeleted(id: string) {
    setZones(prev => prev.filter(z => z.id !== id));
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      ...av, ...css.vars,
    } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .site-opt-row:hover td { background: var(--cardBg, #141618) !important; }
        .zone-action-btn:hover { color: var(--text, #d4d9dd) !important; }
      `}</style>

      <div style={{ padding: '24px 28px', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* ── Site Settings ─────────────────────────────────────────────────── */}
        <section>
          <div style={{
            fontFamily: "'Ubuntu', sans-serif",
            fontSize: 14, fontWeight: 700, color: 'var(--text, #d4d9dd)',
            marginBottom: 16,
          }}>
            site settings
          </div>

          {site ? (
            <div style={{
              background: 'var(--cardBg, #141618)',
              border: '1px solid var(--border2, #262c30)',
              borderRadius: 8, padding: '18px 20px',
            }}>
              <SiteSettingsForm site={site} accent={accent} canEdit={canEdit} />
            </div>
          ) : (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, color: 'var(--text3, #4e5560)',
            }}>
              loading site…
            </div>
          )}
        </section>

        {/* ── Zones ─────────────────────────────────────────────────────────── */}
        <section>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <div>
              <div style={{
                fontFamily: "'Ubuntu', sans-serif",
                fontSize: 14, fontWeight: 700, color: 'var(--text, #d4d9dd)',
              }}>
                zones
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, color: 'var(--text3, #4e5560)', marginTop: 2,
              }}>
                {zones.length} zone{zones.length !== 1 ? 's' : ''}
              </div>
            </div>
            {canEdit && site && (
              <button
                className="btn-ghost"
                style={av}
                onClick={() => setZoneModal({ open: true, zone: null })}
              >
                <Icon name="plus" size={12} />
                add zone
              </button>
            )}
          </div>

          <div style={{
            background: 'var(--cardBg, #141618)',
            border: '1px solid var(--border2, #262c30)',
            borderRadius: 8, overflow: 'hidden',
          }}>
            {zonesLoading ? (
              <div style={{
                padding: '24px 20px', textAlign: 'center',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, color: 'var(--text3, #4e5560)',
              }}>
                loading zones…
              </div>
            ) : zonesErr ? (
              <div style={{
                padding: '24px 20px', textAlign: 'center',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, color: 'var(--red, #c07070)',
              }}>
                {zonesErr}
              </div>
            ) : zones.length === 0 ? (
              <div style={{ padding: '8px 0' }}>
                <EmptyState
                  icon="layers"
                  title="no zones yet"
                  subtitle={canEdit ? 'Add a zone to organize your racks and devices.' : 'No zones have been created for this site.'}
                  action={
                    canEdit && site ? (
                      <button
                        className="btn-ghost"
                        style={av}
                        onClick={() => setZoneModal({ open: true, zone: null })}
                      >
                        <Icon name="plus" size={12} />
                        add zone
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
                    <th>description</th>
                    <th>created</th>
                    {canEdit && <th style={{ width: 72 }} />}
                  </tr>
                </thead>
                <tbody>
                  {zones.map(zone => (
                    <tr key={zone.id} className="site-opt-row">
                      <td className="pri">{zone.name}</td>
                      <td style={{ color: zone.description ? undefined : 'var(--text3, #4e5560)' }}>
                        {zone.description ?? '—'}
                      </td>
                      <td>{new Date(zone.createdAt).toLocaleDateString()}</td>
                      {canEdit && (
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="zone-action-btn"
                              onClick={() => setZoneModal({ open: true, zone })}
                              title="Edit zone"
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
                              className="zone-action-btn"
                              onClick={() => setDeleteZoneModal({ open: true, zone })}
                              title="Delete zone"
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
        </section>

        {/* ── Git-Sync ────────────────────────────────────────────────────── */}
        {canEdit && site && (
          <section>
            <div style={{
              fontFamily: "'Ubuntu', sans-serif",
              fontSize: 14, fontWeight: 700, color: 'var(--text, #d4d9dd)',
              marginBottom: 16,
            }}>
              integrations
            </div>
            <GitSyncConfig accent={accent} />
          </section>
        )}

        {/* ── Audit Log (admin only) ─────────────────────────────────────── */}
        {can('site', 'delete') && site && (
          <section>
            <div style={{
              fontFamily: "'Ubuntu', sans-serif",
              fontSize: 14, fontWeight: 700, color: 'var(--text, #d4d9dd)',
              marginBottom: 16,
            }}>
              audit log
            </div>
            <AuditLogSection siteId={site.id} />
          </section>
        )}
      </div>

      {/* Modals */}
      {site && (
        <>
          <ZoneFormModal
            open={zoneModal.open}
            onClose={() => setZoneModal({ open: false, zone: null })}
            initial={zoneModal.zone}
            siteId={site.id}
            accent={accent}
            onSaved={handleZoneSaved}
          />
          <DeleteZoneModal
            open={deleteZoneModal.open}
            onClose={() => setDeleteZoneModal({ open: false, zone: null })}
            zone={deleteZoneModal.zone}
            siteId={site.id}
            onDeleted={handleZoneDeleted}
          />
        </>
      )}
    </div>
  );
}
