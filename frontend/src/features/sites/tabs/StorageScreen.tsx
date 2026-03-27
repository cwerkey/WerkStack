import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { useRackStore }     from '../../../store/useRackStore';
import { api }              from '../../../utils/api';
import type { SiteCtx }     from '../../SiteShell';
import type { Drive, StoragePool, Share } from '@werkstack/shared';
import { StorageDevicesTab } from './storage/StorageDevicesTab';
import { StorageDrivesTab }  from './storage/StorageDrivesTab';
import { StoragePoolsTab }   from './storage/StoragePoolsTab';
import { StorageSharesTab }  from './storage/StorageSharesTab';

type StorageTab = 'devices' | 'drives' | 'pools' | 'shares';

const TABS: { id: StorageTab; label: string }[] = [
  { id: 'devices', label: 'devices' },
  { id: 'drives',  label: 'drives'  },
  { id: 'pools',   label: 'pools'   },
  { id: 'shares',  label: 'shares'  },
];

export function StorageScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;

  const [tab, setTab] = useState<StorageTab>('devices');

  const [drives, setDrives]   = useState<Drive[]>([]);
  const [pools, setPools]     = useState<StoragePool[]>([]);
  const [shares, setShares]   = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);

  // Device instances come from the rack store (already loaded by SiteShell)
  const devices   = useRackStore(s => s.devices);
  const templates = useTemplateStore(s => s.deviceTemplates);

  useEffect(() => {
    if (!site) return;
    setLoading(true);
    Promise.all([
      api.get<Drive[]>(`/api/sites/${site.id}/drives`),
      api.get<StoragePool[]>(`/api/sites/${site.id}/pools`),
      api.get<Share[]>(`/api/sites/${site.id}/shares`),
    ])
      .then(([dr, p, sh]) => {
        setDrives(dr ?? []);
        setPools(p ?? []);
        setShares(sh ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [site?.id]);

  const siteId = site?.id ?? '';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      ...av, ...css.vars,
    } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .tpill:hover { filter: brightness(1.2); }
        .tab-wrap:hover .tab-btn-inner { color: var(--accent, #c47c5a) !important; }
        .st-row:hover td { background: var(--cardBg, #141618) !important; }
        .st-act-btn:hover { color: var(--text, #d4d9dd) !important; }
        .pool-card:hover { border-color: var(--border, #1d2022) !important; background: #141618 !important; }
        .confirm-danger-btn:hover { background: #a85858 !important; border-color: #a85858 !important; }
        .wiz-input:focus { border-color: var(--accent, #c47c5a) !important; outline: none; }
        .drive-slot-opt:hover { background: var(--border2, #262c30) !important; }
      `}</style>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border2, #262c30)',
        padding: '0 24px', flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-wrap${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-btn-inner">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading ? (
          <div style={{
            padding: 32,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--text3, #4e5560)',
          }}>
            loading…
          </div>
        ) : (
          <>
            {tab === 'devices' && (
              <StorageDevicesTab
                devices={devices}
                drives={drives}
                pools={pools}
                templates={templates}
              />
            )}
            {tab === 'drives' && (
              <StorageDrivesTab
                drives={drives}
                devices={devices}
                pools={pools}
                templates={templates}
                siteId={siteId}
                accent={accent}
                av={av}
                onDriveAdd={d => setDrives(prev => [...prev, d])}
                onDriveUpdate={d => setDrives(prev => prev.map(x => x.id === d.id ? d : x))}
                onDriveDelete={id => setDrives(prev => prev.filter(x => x.id !== id))}
              />
            )}
            {tab === 'pools' && (
              <StoragePoolsTab
                pools={pools}
                devices={devices}
                drives={drives}
                templates={templates}
                siteId={siteId}
                accent={accent}
                av={av}
                onPoolAdd={p => setPools(prev => [...prev, p])}
                onPoolUpdate={p => setPools(prev => prev.map(x => x.id === p.id ? p : x))}
                onPoolDelete={id => setPools(prev => prev.filter(x => x.id !== id))}
                onDrivesUpdate={setDrives}
              />
            )}
            {tab === 'shares' && (
              <StorageSharesTab
                shares={shares}
                pools={pools}
                siteId={siteId}
                accent={accent}
                av={av}
                onShareAdd={s => setShares(prev => [...prev, s])}
                onShareUpdate={s => setShares(prev => prev.map(x => x.id === s.id ? s : x))}
                onShareDelete={id => setShares(prev => prev.filter(x => x.id !== id))}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
