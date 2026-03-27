import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { AppHeader }   from '../../components/layout/AppHeader';
import { EmptyState }  from '../../components/ui/EmptyState';
import { Modal }       from '../../components/ui/Modal';
import { Icon }        from '../../components/ui/Icon';
import { useAuthStore } from '../../store/useAuthStore';
import { useSiteStore } from '../../store/useSiteStore';
import { useCan }       from '../../utils/can';
import { api }          from '../../utils/api';
import { DEFAULT_ACCENT } from '../../styles/tokens';
import type { Site } from '@werkstack/shared';

// ── Color presets ──────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#c47c5a', '#5a8cc4', '#5ac48c', '#c45a8c',
  '#8c5ac4', '#c4a85a', '#5ac4c4', '#c45a5a',
];

// ── Blank site form ────────────────────────────────────────────────────────────
const blank = (): Omit<Site, 'id' | 'orgId' | 'createdAt'> => ({
  name: '', location: '', color: '#c47c5a', description: '',
});

// ── SiteFormModal ──────────────────────────────────────────────────────────────
// Used for both create and edit. Single-step → uses Modal (closes on Escape/backdrop).

interface SiteFormModalProps {
  open:     boolean;
  onClose:  () => void;
  initial:  Site | null; // null = create mode
}

function SiteFormModal({ open, onClose, initial }: SiteFormModalProps) {
  type Draft = Omit<Site, 'id' | 'orgId' | 'createdAt'>;
  const [f, setF]     = useState<Draft>(blank());
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  const upsertSite = useSiteStore(s => s.upsertSite);
  const av = { '--accent': f.color } as React.CSSProperties;

  // Reset form when modal opens/switches mode
  useEffect(() => {
    if (!open) return;
    setErr('');
    setBusy(false);
    setF(initial
      ? { name: initial.name, location: initial.location, color: initial.color, description: initial.description ?? '' }
      : blank()
    );
  }, [open, initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setF(p => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !f.location.trim()) {
      setErr('name and location are required');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const payload = { ...f, description: f.description?.trim() || undefined };
      const result = initial
        ? await api.patch<Site>(`/api/sites/${initial.id}`, payload)
        : await api.post<Site>('/api/sites', payload);
      upsertSite(result!);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to save site');
    } finally {
      setBusy(false);
    }
  }

  const title = initial ? 'edit site' : 'new site';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      minWidth={480}
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
            form="site-form"
            className="act-primary"
            style={av}
            disabled={busy}
          >
            {busy ? 'saving…' : (initial ? 'save changes' : 'create site')}
          </button>
        </div>
      }
    >
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .color-swatch:hover { transform: scale(1.15); }
      `}</style>

      <form id="site-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Name */}
        <div className="wiz-field">
          <label className="wiz-label">name *</label>
          <input
            className="wiz-input"
            value={f.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Home Lab, Data Center, Office"
            autoFocus
          />
        </div>

        {/* Location */}
        <div className="wiz-field">
          <label className="wiz-label">location *</label>
          <input
            className="wiz-input"
            value={f.location}
            onChange={e => set('location', e.target.value)}
            placeholder="e.g. Basement, 123 Main St, AWS us-east-1"
          />
        </div>

        {/* Color */}
        <div className="wiz-field">
          <label className="wiz-label">accent color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                className="color-swatch"
                onClick={() => set('color', c)}
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: c, border: `2px solid ${f.color === c ? '#fff' : 'transparent'}`,
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'transform 0.1s, border-color 0.1s',
                }}
              />
            ))}
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: 'var(--text3, #4e5560)', marginLeft: 4,
            }}>
              or
            </span>
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
          <label className="wiz-label">description (optional)</label>
          <textarea
            className="wiz-input"
            value={f.description ?? ''}
            onChange={e => set('description', e.target.value)}
            placeholder="Brief description of this site…"
            rows={3}
            style={{ resize: 'vertical', minHeight: 60 }}
          />
        </div>
      </form>
    </Modal>
  );
}

// ── DeleteSiteModal ────────────────────────────────────────────────────────────

interface DeleteSiteModalProps {
  open:    boolean;
  onClose: () => void;
  site:    Site | null;
}

function DeleteSiteModal({ open, onClose, site }: DeleteSiteModalProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  const removeSite      = useSiteStore(s => s.removeSite);

  useEffect(() => {
    if (open) { setBusy(false); setErr(''); }
  }, [open]);

  async function handleDelete() {
    if (!site) return;
    setBusy(true);
    setErr('');
    try {
      await api.delete(`/api/sites/${site.id}`);
      removeSite(site.id);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to delete site');
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="delete site"
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
          <button className="confirm-danger-btn" onClick={handleDelete} disabled={busy}>
            {busy ? 'deleting…' : 'delete site'}
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
        Delete <span style={{ color: 'var(--text, #d4d9dd)', fontWeight: 600 }}>
          {site?.name}
        </span>? This will permanently remove the site and all its zones, racks, and
        devices. This action cannot be undone.
      </div>
    </Modal>
  );
}

// ── SiteCard ───────────────────────────────────────────────────────────────────

interface SiteCardProps {
  site:     Site;
  canEdit:  boolean;
  onClick:  () => void;
  onEdit:   () => void;
  onDelete: () => void;
}

function SiteCard({ site, canEdit, onClick, onEdit, onDelete }: SiteCardProps) {
  return (
    <div
      className="site-card"
      style={{
        background: 'var(--cardBg2, #0c0d0e)',
        border: '1px solid var(--border2, #262c30)',
        borderRadius: 10,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {/* Clickable main area */}
      <button
        onClick={onClick}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', padding: 0, display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: site.color, flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "'Ubuntu', sans-serif",
            fontSize: 14, fontWeight: 700,
            color: 'var(--text, #d4d9dd)',
          }}>
            {site.name}
          </span>
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, color: 'var(--text3, #4e5560)',
        }}>
          {site.location}
        </div>
        {site.description && (
          <div style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 12, color: 'var(--text2, #8a9299)',
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
          }}>
            {site.description}
          </div>
        )}
      </button>

      {/* Action buttons — appear on card hover */}
      {canEdit && (
        <div className="sc-actions" style={{
          position: 'absolute', top: 12, right: 12,
          display: 'flex', gap: 4,
          opacity: 0, transition: 'opacity 0.15s',
        }}>
          <button
            className="sc-action-btn"
            onClick={e => { e.stopPropagation(); onEdit(); }}
            title="Edit site"
            style={{
              background: 'var(--inputBg, #1a1d20)',
              border: '1px solid var(--border2, #262c30)',
              borderRadius: 4, padding: '3px 6px',
              color: 'var(--text2, #8a9299)', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Icon name="edit" size={12} />
          </button>
          <button
            className="sc-action-btn"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Delete site"
            style={{
              background: 'var(--inputBg, #1a1d20)',
              border: '1px solid var(--border2, #262c30)',
              borderRadius: 4, padding: '3px 6px',
              color: 'var(--red, #c07070)', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── LandingPage ────────────────────────────────────────────────────────────────

export function LandingPage() {
  const navigate = useNavigate();
  const user     = useAuthStore(s => s.user);
  const sites    = useSiteStore(s => s.sites);
  const { can }  = useCan();
  const canEdit  = can('site', 'write');

  const [formModal, setFormModal]     = useState<{ open: boolean; site: Site | null }>({ open: false, site: null });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; site: Site | null }>({ open: false, site: null });

  const av = { '--accent': DEFAULT_ACCENT } as React.CSSProperties;

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div style={{ ...av, minHeight: '100vh', background: 'var(--pageBg, #0f1011)' }}>
      <style>{`
        .nav-btn:hover { background: var(--inputBg, #1a1d20) !important; color: var(--accent, #c47c5a) !important; }
        .act-primary:hover { background: var(--accent-dark, #a25a38) !important; border-color: var(--accent-dark, #a25a38) !important; }
        .site-card:hover { border-color: var(--border3, #2e3538) !important; background: var(--cardBg, #141618) !important; }
        .site-card:hover .sc-actions { opacity: 1 !important; }
        .sc-action-btn:hover { border-color: var(--border3, #2e3538) !important; background: var(--cardBg, #141618) !important; }
      `}</style>

      <AppHeader />

      <div style={{
        marginTop: 38,
        padding: '32px 40px',
        maxWidth: 1100,
        margin: '38px auto 0',
      }}>
        {/* Header row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24,
        }}>
          <div>
            <div style={{
              fontFamily: "'Ubuntu', sans-serif",
              fontSize: 20, fontWeight: 700,
              color: 'var(--text, #d4d9dd)',
              marginBottom: 3,
            }}>
              your sites
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: 'var(--text3, #4e5560)',
            }}>
              {sites.length} site{sites.length !== 1 ? 's' : ''}
            </div>
          </div>
          {canEdit && (
            <button
              className="act-primary"
              style={av}
              onClick={() => setFormModal({ open: true, site: null })}
            >
              <Icon name="plus" size={12} />
              new site
            </button>
          )}
        </div>

        {/* Site grid */}
        {sites.length === 0 ? (
          <EmptyState
            icon="box"
            title="no sites yet"
            subtitle="Create your first site to start documenting your infrastructure."
            action={
              canEdit ? (
                <button
                  className="act-primary"
                  style={av}
                  onClick={() => setFormModal({ open: true, site: null })}
                >
                  <Icon name="plus" size={12} />
                  create site
                </button>
              ) : undefined
            }
          />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}>
            {sites.map(site => (
              <SiteCard
                key={site.id}
                site={site}
                canEdit={canEdit}
                onClick={() => navigate(`/sites/${site.id}/overview`)}
                onEdit={() => setFormModal({ open: true, site })}
                onDelete={() => setDeleteModal({ open: true, site })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <SiteFormModal
        open={formModal.open}
        onClose={() => setFormModal({ open: false, site: null })}
        initial={formModal.site}
      />
      <DeleteSiteModal
        open={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, site: null })}
        site={deleteModal.site}
      />
    </div>
  );
}
