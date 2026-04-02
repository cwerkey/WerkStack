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
  enabled: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'pending';
}

interface GitSyncStatus {
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'pending';
}

interface ImportFile {
  path: string;
  title: string;
  manualName: string;
  status: 'new' | 'conflict' | 'unchanged';
  existingGuideId?: string;
}

interface ImportPreviewResponse {
  files: ImportFile[];
}

interface ImportConfirmResponse {
  imported: number;
  skipped: number;
  errors: string[];
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

function useToggleEnabled(siteId: string) {
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch<GitSyncConfig>(`/api/sites/${siteId}/git-sync/enabled`, { enabled }),
  });
}

function useTestConnection(siteId: string) {
  return useMutation({
    mutationFn: (body: { remoteUrl: string; branch: string; authToken?: string }) =>
      api.post<{ ok: boolean; message?: string }>(`/api/sites/${siteId}/git-sync/test`, body),
  });
}

function useImportPreview(siteId: string) {
  return useMutation({
    mutationFn: () =>
      api.post<ImportPreviewResponse>(`/api/sites/${siteId}/git-sync/import`, {}),
  });
}

function useConfirmImport(siteId: string) {
  return useMutation({
    mutationFn: (files: { path: string; action: 'skip' | 'overwrite' | 'create_new' }[]) =>
      api.post<ImportConfirmResponse>(`/api/sites/${siteId}/git-sync/import/confirm`, { files }),
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
  const { data: config, isLoading, refetch: refetchConfig } = useGetGitSyncConfig(siteId);
  const { data: statusData } = useGetGitSyncStatus(siteId);
  const saveMut    = useSaveGitSyncConfig(siteId);
  const syncMut    = useTriggerSync(siteId);
  const testMut    = useTestConnection(siteId);
  const toggleMut  = useToggleEnabled(siteId);
  const importMut  = useImportPreview(siteId);
  const confirmMut = useConfirmImport(siteId);

  const [remoteUrl, setRemoteUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [authToken, setAuthToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenDirty, setTokenDirty] = useState(false);
  const [error, setError] = useState('');
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Import state
  const [importFiles, setImportFiles] = useState<ImportFile[] | null>(null);
  const [importActions, setImportActions] = useState<Record<string, 'skip' | 'overwrite' | 'create_new'>>({});
  const [importResult, setImportResult] = useState<ImportConfirmResponse | null>(null);

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

  const handleImportPreview = () => {
    setImportFiles(null);
    setImportResult(null);
    setImportActions({});
    importMut.mutate(undefined, {
      onSuccess: (res) => {
        setImportFiles(res.files);
        // Set default actions: new → create_new, conflict → skip, unchanged → skip
        const defaults: Record<string, 'skip' | 'overwrite' | 'create_new'> = {};
        for (const f of res.files) {
          if (f.status === 'new') defaults[f.path] = 'create_new';
          else if (f.status === 'conflict') defaults[f.path] = 'overwrite';
          else defaults[f.path] = 'skip';
        }
        setImportActions(defaults);
      },
      onError: (err) => setSyncResult({ ok: false, message: err instanceof Error ? err.message : 'Import preview failed' }),
    });
  };

  const handleConfirmImport = () => {
    if (!importFiles) return;
    setImportResult(null);
    const payload = importFiles.map(f => ({
      path: f.path,
      action: importActions[f.path] ?? 'skip',
    }));
    confirmMut.mutate(payload, {
      onSuccess: (res) => {
        setImportResult(res);
        setImportFiles(null);
      },
      onError: (err) => setSyncResult({ ok: false, message: err instanceof Error ? err.message : 'Import failed' }),
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

            <div style={{ marginTop: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className={settingsStyles.primaryBtn}
                onClick={handleSync}
                disabled={syncMut.isPending || !(config?.enabled ?? true)}
              >
                {syncMut.isPending ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                className={settingsStyles.ghostBtn}
                onClick={handleImportPreview}
                disabled={importMut.isPending}
              >
                {importMut.isPending ? 'Scanning...' : 'Import from Git'}
              </button>
              <button
                className={settingsStyles.ghostBtn}
                onClick={() => {
                  const next = !(config?.enabled ?? true);
                  toggleMut.mutate(next, { onSuccess: () => refetchConfig() });
                }}
                disabled={toggleMut.isPending}
              >
                {toggleMut.isPending
                  ? '...'
                  : (config?.enabled ?? true) ? 'Pause Auto-Sync' : 'Resume Auto-Sync'}
              </button>
            </div>

            {/* Import preview */}
            {importFiles && (
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
                <p className={styles.sectionTitle} style={{ marginBottom: '8px' }}>Import Preview</p>
                {importFiles.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', margin: 0 }}>
                    No markdown files found in the remote repository.
                  </p>
                ) : (
                  <>
                    <ul className={styles.importList}>
                      {importFiles.map(f => (
                        <li key={f.path} className={styles.importItem}>
                          <span className={`${styles.importDot} ${
                            f.status === 'new' ? styles.importDotNew
                            : f.status === 'conflict' ? styles.importDotConflict
                            : styles.importDotUnchanged
                          }`} />
                          <span className={styles.importTitle}>{f.title}</span>
                          <span className={styles.importManual}>{f.manualName}</span>
                          {f.status === 'new' && (
                            <select
                              className={styles.importSelect}
                              value={importActions[f.path] ?? 'create_new'}
                              onChange={e => setImportActions(prev => ({ ...prev, [f.path]: e.target.value as 'create_new' | 'skip' }))}
                            >
                              <option value="create_new">Import</option>
                              <option value="skip">Skip</option>
                            </select>
                          )}
                          {f.status === 'conflict' && (
                            <select
                              className={styles.importSelect}
                              value={importActions[f.path] ?? 'overwrite'}
                              onChange={e => setImportActions(prev => ({ ...prev, [f.path]: e.target.value as 'overwrite' | 'skip' | 'create_new' }))}
                            >
                              <option value="overwrite">Overwrite</option>
                              <option value="create_new">Create Copy</option>
                              <option value="skip">Skip</option>
                            </select>
                          )}
                          {f.status === 'unchanged' && (
                            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>unchanged</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <button
                        className={settingsStyles.primaryBtn}
                        onClick={handleConfirmImport}
                        disabled={confirmMut.isPending}
                      >
                        {confirmMut.isPending ? 'Importing...' : 'Confirm Import'}
                      </button>
                      <button
                        className={settingsStyles.ghostBtn}
                        onClick={() => { setImportFiles(null); setImportActions({}); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className={styles.importSummary}>
                {importResult.imported} imported, {importResult.skipped} skipped
                {importResult.errors.length > 0 && (
                  <div className={styles.importSummaryErrors}>
                    {importResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
