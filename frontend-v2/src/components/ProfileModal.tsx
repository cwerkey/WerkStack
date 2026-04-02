import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUpdateProfile } from '@/api/profile';
import styles from './ProfileModal.module.css';

const PRESETS = ['#c47c5a', '#5a8cc4', '#5ac48c', '#c45a8c', '#8c5ac4', '#c4a85a', '#5ac4c4', '#c45a5a'];

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user    = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);
  const setAccent = useThemeStore(s => s.setAccent);
  const updateProfile = useUpdateProfile();

  const [username, setUsername]     = useState('');
  const [curPwd, setCurPwd]         = useState('');
  const [newPwd, setNewPwd]         = useState('');
  const [color, setColor]           = useState(PRESETS[0]);
  const [hexInput, setHexInput]     = useState(PRESETS[0]);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [busy, setBusy]             = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setUsername(user.username);
    const c = user.accentColor ?? PRESETS[0];
    setColor(c);
    setHexInput(c);
    setCurPwd('');
    setNewPwd('');
    setError('');
    setSuccess('');
    setBusy(false);
  }, [open, user]);

  if (!open || !user) return null;

  function pickColor(hex: string) {
    setColor(hex);
    setHexInput(hex);
  }

  function handleHexChange(val: string) {
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setColor(val);
  }

  async function handleSave() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const body: Record<string, string | null | undefined> = {};
      if (user && username !== user.username) body.username = username;
      body.accentColor = color;
      if (newPwd) {
        if (!curPwd) { setError('current password required'); setBusy(false); return; }
        body.currentPassword = curPwd;
        body.newPassword = newPwd;
      }
      const res = await updateProfile.mutateAsync(body as any);
      setUser(res.user);
      setAccent(res.user.accentColor ?? PRESETS[0]);
      setSuccess('saved');
      setCurPwd('');
      setNewPwd('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>
          edit profile
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </h2>

        <div className={styles.field}>
          <span className={styles.label}>username</span>
          <input className={styles.input} value={username} onChange={e => setUsername(e.target.value)} />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>email</span>
          <input className={styles.readOnly} value={user.email} readOnly tabIndex={-1} />
        </div>

        <hr className={styles.divider} />

        <div className={styles.field}>
          <span className={styles.label}>current password</span>
          <input className={styles.input} type="password" value={curPwd}
            onChange={e => setCurPwd(e.target.value)} placeholder="required to change password" />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>new password</span>
          <input className={styles.input} type="password" value={newPwd}
            onChange={e => setNewPwd(e.target.value)} placeholder="leave blank to keep current" />
        </div>

        <hr className={styles.divider} />

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

        <div className={styles.footer}>
          {error && <span className={styles.errorText}>{error}</span>}
          {success && <span className={styles.successText}>{success}</span>}
          <button className={styles.btnGhost} onClick={onClose}>cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={busy}>
            {busy ? 'saving...' : 'save'}
          </button>
        </div>
      </div>
    </div>
  );
}
