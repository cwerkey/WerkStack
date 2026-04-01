import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/utils/api';
import styles from './GitSyncSettings.module.css';
import settingsStyles from './SettingsPage.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GitSyncConfig {
  remoteUrl: string;
  branch: string;
  authToken: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'pending';
}

interface GitSyncStatus {
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'pending';
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useGetGitSyncConfig(siteId: string) {
  return useQuery({
    queryKey: ['git-sync-config', siteId],
    queryFn: () => api.get<GitSyncConfig>(`/api/sites/${siteId}/git-sync/config`),
    enabled: !!siteId,
    retry: false,
  });
}

function useGetGitSyncStatus(siteId: string) {
  return useQuery({
    queryKey: ['git-sync-status', siteId],
    queryFn: () => api.get<GitSyncStatus>(`/api/sites/${siteId}/git-sync/status`),
    enabled: !!siteId,
    retry: false,
  });
}

function useSaveGitSyncConfig(siteId: string) {
  return useMutation({
    mutationFn: (body: { remoteUrl: string; branch: string; authToken?: string }) =>
      api.put<GitSyncConfig>(`/api/sites/${siteId}/git-sync/config`, body),
  });
}

function useTriggerSync(siteId: string) {
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; message?: string }>(`/api/sites/${siteId}/git-sync/sync`, {}),
  });
}

function useTestConnection(siteId: string) {
  return useMutation({
    mutationFn: (body: { remoteUrl: string; branch: string; authToken?: string }) =>
      api.post<{ ok: boolean; message?: string }>(`/api/sites/${siteId}/git-sync/test`, body),
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className={`${styles.pill} ${styles.pillPending}`}>never synced</span>;
  if (status === 'success') return <span className={`${styles.pill} ${styles.pillSuccess}`}>success</span>;
  if (status === 'error') return <span className={`${styles.pill} ${styles.pillError}`}>error</span>;
  return <span className={`${styles.pill} ${styles.pillPending}`}>{status}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GitSyncSettings({ siteId }: { siteId: string }) {
  const { data: config, isLoading } = useGetGitSyncConfig(siteId);
  const { data: statusData } = useGetGitSyncStatus(siteId);
  const saveMut = useSaveGitSyncConfig(siteId);
  const syncMut = useTriggerSync(siteId);
  const testMut = useTestConnection(siteId);

  const [remoteUrl, setRemoteUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [authToken, setAuthToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenDirty, setTokenDirty] = useState(false);
  const [error, setError] = useState('');
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (config) {
      setRemoteUrl(config.remoteUrl ?? '');
      setBranch(config.branch ?? 'main');
      setAuthToken('');
      setTokenDirty(false);
    }
  }, [config]);

  const isConfigured = !!(config?.remoteUrl);

  const handleSave = () => {
    if (!remoteUrl.trim()) {
      setError('Remote URL is required');
      return;
    }
    setError('');
    setSaveResult(null);
    const body: { remoteUrl: string; branch: string; authToken?: string } = {
      remoteUrl: remoteUrl.trim(),
      branch: branch.trim() || 'main',
    };
    if (tokenDirty && authToken) {
      body.authToken = authToken;
    }
    saveMut.mutate(body, {
      onSuccess: () => {
        setSaveResult({ ok: true, message: 'Configuration saved.' });
        setTokenDirty(false);
        setShowToken(false);
        setAuthToken('');
      },
      onError: (err) => {
        setSaveResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to save' });
      },
    });
  };

  const handleTest = () => {
    setTestResult(null);
    const body: { remoteUrl: string; branch: string; authToken?: string } = {
      remoteUrl: remoteUrl.trim() || (config?.remoteUrl ?? ''),
      branch: branch.trim() || 'main',
    };
    if (tokenDirty && authToken) {
      body.authToken = authToken;
    }
    testMut.mutate(body, {
      onSuccess: (res) => setTestResult({ ok: res.ok, message: res.message ?? (res.ok ? 'Connection successful.' : 'Connection failed.') }),
      onError: (err) => setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' }),
    });
  };

  const handleSync = () => {
    setSyncResult(null);
    syncMut.mutate(undefined, {
      onSuccess: (res) => setSyncResult({ ok: res.ok, message: res.message ?? (res.ok ? 'Sync complete.' : 'Sync failed.') }),
      onError: (err) => setSyncResult({ ok: false, message: err instanceof Error ? err.message : 'Sync failed' }),
    });
  };

  if (isLoading) {
    return <div style={{ color: '#8a9299', fontSize: '13px', padding: '20px 0' }}>Loading git sync config...</div>;
  }

  if (!siteId) {
    return <div className={styles.emptyState}>Select a site to configure git sync.</div>;
  }

  return (
    <div className={styles.container}>
      {!isConfigured && (
        <div className={styles.emptyState} style={{ textAlign: 'left', padding: '0 0 16px' }}>
          <p style={{ margin: '0 0 4px', color: '#d4d9dd', fontSize: '13px' }}>Git sync not configured.</p>
          <p style={{ margin: 0, color: '#8a9299', fontSize: '12px' }}>Enter a remote URL to get started.</p>
        </div>
      )}

      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Repository</p>
        <div className={styles.card}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Remote URL</label>
            <input
              className={styles.input}
              type="text"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://github.com/org/repo.git"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Branch</label>
            <input
              className={styles.input}
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Auth Token</label>
            {!showToken && !tokenDirty ? (
              <div className={styles.tokenRow}>
                <input
                  className={styles.input}
                  type="password"
                  value={config?.authToken ? '••••••••••••' : ''}
                  readOnly
                  placeholder={config?.authToken ? undefined : 'Not set'}
                />
                <button
                  className={settingsStyles.ghostBtn}
                  style={{ flexShrink: 0 }}
                  onClick={() => { setShowToken(true); setAuthToken(''); }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className={styles.tokenRow}>
                <input
                  className={styles.input}
                  type="text"
                  value={authToken}
                  onChange={(e) => { setAuthToken(e.target.value); setTokenDirty(true); }}
                  placeholder="Enter new token (PAT or password)"
                  autoFocus
                />
                <button
                  className={settingsStyles.ghostBtn}
                  style={{ flexShrink: 0 }}
                  onClick={() => { setShowToken(false); setTokenDirty(false); setAuthToken(''); }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {saveResult && (
            <div className={`${styles.inlineResult} ${saveResult.ok ? styles.inlineResultSuccess : styles.inlineResultError}`}>
              {saveResult.message}
            </div>
          )}

          {testResult && (
            <div className={`${styles.inlineResult} ${testResult.ok ? styles.inlineResultSuccess : styles.inlineResultError}`}>
              {testResult.message}
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={settingsStyles.ghostBtn}
              onClick={handleTest}
              disabled={testMut.isPending || !remoteUrl.trim()}
            >
              {testMut.isPending ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              className={settingsStyles.primaryBtn}
              onClick={handleSave}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? 'Saving...' : 'Save Config'}
            </button>
          </div>
        </div>
      </div>

      {isConfigured && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Sync</p>
          <div className={styles.card}>
            <div className={styles.statusSection}>
              <span className={styles.statusLabel}>Last sync:</span>
              <StatusBadge status={statusData?.lastSyncStatus ?? config?.lastSyncStatus} />
              {(statusData?.lastSyncAt ?? config?.lastSyncAt) && (
                <span style={{ fontSize: '11px', color: '#8a9299', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {new Date(statusData?.lastSyncAt ?? config?.lastSyncAt ?? '').toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            {syncResult && (
              <div className={`${styles.inlineResult} ${syncResult.ok ? styles.inlineResultSuccess : styles.inlineResultError}`}>
                {syncResult.message}
              </div>
            )}

            <div style={{ marginTop: '14px' }}>
              <button
                className={settingsStyles.primaryBtn}
                onClick={handleSync}
                disabled={syncMut.isPending}
              >
                {syncMut.isPending ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
