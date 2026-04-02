import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useSiteStore } from '@/stores/siteStore';
import { useGetSites, useCreateSite, useUpdateSite, useDeleteSite, useSeedDemo } from '@/api/sites';
import type { Site } from '@werkstack/shared';
import styles from './SiteSelectorPage.module.css';

const PRESETS = ['#c47c5a', '#5a8cc4', '#5ac48c', '#c45a8c', '#8c5ac4', '#c4a85a', '#5ac4c4', '#c45a5a'];

// ─── Site Form Modal ────────────────────────────────────────────────────────

function SiteFormModal({ open, site, onClose }: {
  open: boolean;
  site: Site | null;
  onClose: () => void;
}) {
  const user = useAuthStore(s => s.user);
  const isEdit = !!site;

  const [name, setName]         = useState('');
  const [location, setLocation] = useState('');
  const [color, setColor]       = useState(PRESETS[0]);
  const [hexInput, setHexInput] = useState(PRESETS[0]);
  const [desc, setDesc]         = useState('');
  const [seedDemo, setSeedDemo] = useState(false);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const seedDemoMut = useSeedDemo();

  useEffect(() => {
    if (!open) return;
    if (site) {
      setName(site.name);
      setLocation(site.location);
      setColor(site.color);
      setHexInput(site.color);
      setDesc(site.description ?? '');
    } else {
      setName('');
      setLocation('');
      setColor(PRESETS[0]);
      setHexInput(PRESETS[0]);
      setDesc('');
    }
    setSeedDemo(false);
    setError('');
    setBusy(false);
  }, [open, site]);

  if (!open) return null;

  function pickColor(hex: string) {
    setColor(hex);
    setHexInput(hex);
  }

  function handleHexChange(val: string) {
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setColor(val);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const l = location.trim();
    if (!n) return setError('name is required');
    if (!l) return setError('location is required');
    setBusy(true);
    setError('');
    try {
      if (isEdit) {
        await updateSite.mutateAsync({ id: site!.id, name: n, location: l, color, description: desc || undefined });
      } else {
        const created = await createSite.mutateAsync({ name: n, location: l, color, description: desc || undefined });
        if (seedDemo && user?.role === 'owner') {
          try { await seedDemoMut.mutateAsync(created.id); } catch { /* best-effort */ }
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form className={styles.modal} onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className={styles.modalTitle}>
          {isEdit ? 'edit site' : 'new site'}
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </h2>

        <div className={styles.field}>
          <span className={styles.label}>name <span className={styles.required}>*</span></span>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Home Lab, Data Center, Office" autoFocus />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>location <span className={styles.required}>*</span></span>
          <input className={styles.input} value={location} onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Basement, 123 Main St, AWS us-east-1" />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>accent color</span>
          <div className={styles.colorRow}>
            {PRESETS.map(hex => (
              <button key={hex} type="button"
                className={`${styles.colorSwatch}${color === hex ? ' ' + styles.selected : ''}`}
                style={{ backgroundColor: hex }}
                onClick={() => pickColor(hex)} />
            ))}
            <div className={styles.colorHexWrap}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>or</span>
              <input className={styles.colorHexInput} value={hexInput}
                onChange={e => handleHexChange(e.target.value)} />
              <div className={styles.colorPreview} style={{ backgroundColor: color }} />
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>description (optional)</span>
          <textarea className={styles.textarea} rows={3} value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Brief description of this site..." />
        </div>

        {!isEdit && user?.role === 'owner' && (
          <label className={styles.checkRow}>
            <input type="checkbox" checked={seedDemo} onChange={e => setSeedDemo(e.target.checked)} />
            Populate with demo data (2 zones, 2 racks, 50 devices)
          </label>
        )}

        <div className={styles.footer}>
          {error && <span className={styles.errorText}>{error}</span>}
          <button type="button" className={styles.btnGhost} onClick={onClose}>cancel</button>
          <button type="submit" className={styles.btnPrimary} disabled={busy}>
            {busy ? 'saving...' : isEdit ? 'save changes' : 'create site'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Delete Modal ───────────────────────────────────────────────────────────

function DeleteSiteModal({ open, site, onClose }: {
  open: boolean;
  site: Site | null;
  onClose: () => void;
}) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const deleteSite = useDeleteSite();

  useEffect(() => { if (open) { setBusy(false); setError(''); } }, [open]);

  if (!open || !site) return null;

  async function handleDelete() {
    setBusy(true);
    setError('');
    try {
      await deleteSite.mutateAsync(site!.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>
          delete site
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </h2>
        <p className={styles.deleteBody}>
          Delete <span className={styles.deleteName}>{site.name}</span>? This will permanently remove
          the site and all its zones, racks, and devices. This action cannot be undone.
        </p>
        <div className={styles.footer}>
          {error && <span className={styles.errorText}>{error}</span>}
          <button className={styles.btnGhost} onClick={onClose}>cancel</button>
          <button className={styles.btnDanger} onClick={handleDelete} disabled={busy}>
            {busy ? 'deleting...' : 'delete site'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SiteSelectorPage() {
  const navigate = useNavigate();
  const user     = useAuthStore(s => s.user);
  const logout   = useAuthStore(s => s.logout);
  const theme    = useThemeStore(s => s.theme);
  const setSite  = useSiteStore(s => s.setSite);

  const { data: sites = [] } = useGetSites();

  const [formOpen, setFormOpen]     = useState(false);
  const [editSite, setEditSite]     = useState<Site | null>(null);
  const [deleteSite, setDeleteSite] = useState<Site | null>(null);

  const canManage = user?.role === 'owner' || user?.role === 'admin';

  function handleSelect(site: Site) {
    setSite(site);
    navigate('/');
  }

  function handleEdit(e: React.MouseEvent, site: Site) {
    e.stopPropagation();
    setEditSite(site);
    setFormOpen(true);
  }

  function handleDeleteClick(e: React.MouseEvent, site: Site) {
    e.stopPropagation();
    setDeleteSite(site);
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    logout();
    navigate('/login');
  }

  return (
    <div className={styles.page} data-theme={theme}>
      <div className={styles.topBar}>
        <span className={styles.brand}>WerkStack</span>
        {user && (
          <button className={styles.btnGhost} onClick={handleLogout} style={{ fontSize: 11 }}>
            sign out
          </button>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.heading}>your sites</h1>
            <div className={styles.count}>{sites.length} site{sites.length !== 1 ? 's' : ''}</div>
          </div>
          {canManage && (
            <button className={styles.newBtn} onClick={() => { setEditSite(null); setFormOpen(true); }}>
              + new site
            </button>
          )}
        </div>

        {sites.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>⬡</div>
            <div className={styles.emptyTitle}>no sites yet</div>
            <div className={styles.emptyDesc}>Create your first site to get started.</div>
            {canManage && (
              <button className={styles.btnPrimary} onClick={() => { setEditSite(null); setFormOpen(true); }}>
                + new site
              </button>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {sites.map(site => (
              <div key={site.id} className={styles.card} onClick={() => handleSelect(site)}>
                <div className={styles.cardNameRow}>
                  <div className={styles.colorDot} style={{ backgroundColor: site.color }} />
                  <span className={styles.cardName}>{site.name}</span>
                </div>
                {site.location && <div className={styles.cardLocation}>{site.location}</div>}
                {site.description && <div className={styles.cardDesc}>{site.description}</div>}
                {canManage && (
                  <div className={styles.actions}>
                    <button className={styles.actionBtn} onClick={e => handleEdit(e, site)} title="Edit site">✎</button>
                    <button className={styles.actionBtn} onClick={e => handleDeleteClick(e, site)} title="Delete site">🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <SiteFormModal open={formOpen} site={editSite}
        onClose={() => { setFormOpen(false); setEditSite(null); }} />

      <DeleteSiteModal open={!!deleteSite} site={deleteSite}
        onClose={() => setDeleteSite(null)} />
    </div>
  );
}
