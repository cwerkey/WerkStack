import { useState, useEffect, useCallback } from 'react';
import { useParams }     from 'react-router-dom';
import { api }           from '../../../../utils/api';
import type { GitSyncConfig as GitSyncConfigType } from '@werkstack/shared';

// ── GitSyncConfig ────────────────────────────────────────────────────────────

export function GitSyncConfig({ accent }: { accent: string }) {
  const { siteId } = useParams<{ siteId: string }>();

  const [config, setConfig]   = useState<GitSyncConfigType | null>(null);
  const [loaded, setLoaded]   = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch]   = useState('main');
  const [enabled, setEnabled] = useState(false);
  const [interval, setInterval_] = useState(300);
  const [busy, setBusy]       = useState(false);
  const [pushing, setPushing] = useState(false);
  const [err, setErr]         = useState('');
  const [msg, setMsg]         = useState('');

  const load = useCallback(async () => {
    if (!siteId) return;
    try {
      const c = await api.get<GitSyncConfigType | null>(`/api/sites/${siteId}/git-sync`);
      setConfig(c ?? null);
      if (c) {
        setRepoUrl(c.repoUrl);
        setBranch(c.branch);
        setEnabled(c.enabled);
        setInterval_(c.pushInterval);
      }
    } catch { /* non-fatal */ }
    setLoaded(true);
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!siteId) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const result = await api.put<GitSyncConfigType>(`/api/sites/${siteId}/git-sync`, {
        repoUrl, branch, enabled, pushInterval: interval,
      });
      setConfig(result!);
      setMsg('saved');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  const push = async () => {
    if (!siteId) return;
    setPushing(true);
    setErr('');
    setMsg('');
    try {
      await api.post(`/api/sites/${siteId}/git-sync/push`, {});
      setMsg('push completed');
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'push failed');
    } finally {
      setPushing(false);
    }
  };

  if (!loaded) return null;

  return (
    <div style={{
      background: 'var(--cardBg, #141618)',
      border: '1px solid var(--border, #1d2022)',
      borderRadius: 8, padding: 16,
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, fontWeight: 700,
        color: 'var(--text, #d4d9dd)',
        marginBottom: 12,
      }}>
        git-sync
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
            repository url
          </span>
          <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
            placeholder="https://github.com/org/repo.git"
            style={{
              background: 'var(--inputBg, #1a1d20)', border: '1px solid var(--border2, #262c30)',
              borderRadius: 4, padding: '5px 10px', color: 'var(--text, #d4d9dd)',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
              branch
            </span>
            <input value={branch} onChange={e => setBranch(e.target.value)}
              style={{
                background: 'var(--inputBg, #1a1d20)', border: '1px solid var(--border2, #262c30)',
                borderRadius: 4, padding: '5px 10px', color: 'var(--text, #d4d9dd)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
              push interval (seconds)
            </span>
            <input type="number" min={60} max={86400} value={interval}
              onChange={e => setInterval_(Math.max(60, parseInt(e.target.value) || 300))}
              style={{
                background: 'var(--inputBg, #1a1d20)', border: '1px solid var(--border2, #262c30)',
                borderRadius: 4, padding: '5px 10px', color: 'var(--text, #d4d9dd)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              }} />
          </label>
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: 'var(--text, #d4d9dd)', cursor: 'pointer',
        }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          enabled (auto-push on schedule)
        </label>

        {err && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--red, #c07070)' }}>{err}</div>}
        {msg && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--green, #70b870)' }}>{msg}</div>}

        {config?.lastPushAt && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
            last push: {new Date(config.lastPushAt).toLocaleString()}
            {config.lastPushError && (
              <span style={{ color: 'var(--red, #c07070)', marginLeft: 8 }}>
                error: {config.lastPushError}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="act-primary" onClick={save} disabled={!repoUrl || busy}
            style={{
              background: accent, border: 'none', borderRadius: 4,
              padding: '5px 12px', color: '#fff',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              fontWeight: 700, cursor: 'pointer',
              opacity: !repoUrl ? 0.5 : 1,
            }}>
            {busy ? 'saving...' : 'save config'}
          </button>
          {config && (
            <button className="btn-ghost" onClick={push} disabled={pushing}
              style={{ fontSize: 11, padding: '5px 12px', borderRadius: 4 }}>
              {pushing ? 'pushing...' : 'push now'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
