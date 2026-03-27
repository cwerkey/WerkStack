import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  useThemeStore,
  OS_THEME_TOKENS,
  OS_THEME_LABELS,
  OS_THEME_DOT_COLOR,
  themeToVars,
  type OsThemeMode,
} from '../../../store/useThemeStore';
import { useRackStore }   from '../../../store/useRackStore';
import { useTypesStore }  from '../../../store/useTypesStore';
import { api }            from '../../../utils/api';
import type { SiteCtx }  from '../../SiteShell';
import type { OsHost, OsVm, OsApp } from '@werkstack/shared';
import { OsStacksTab }   from './os_stack/OsStacksTab';
import { OsVmsTab }      from './os_stack/OsVmsTab';
import { OsAppsTab }     from './os_stack/OsAppsTab';
import { OsListView }    from './os_stack/OsListView';
import { VmEditorModal } from './os_stack/VmEditorModal';
import { AppEditorModal } from './os_stack/AppEditorModal';
import { HostEditorModal } from './os_stack/HostEditorModal';

type OsTab = 'stacks' | 'vms' | 'apps';

const TABS: { id: OsTab; label: string }[] = [
  { id: 'stacks', label: 'stacks' },
  { id: 'vms',    label: 'vms'    },
  { id: 'apps',   label: 'apps'   },
];

const THEME_MODES: OsThemeMode[] = ['homelab-dark', 'enterprise-dark', 'enterprise-light'];

export function OsStackScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;

  const osTheme    = useThemeStore(s => s.osTheme);
  const setOsTheme = useThemeStore(s => s.setOsTheme);
  const th         = OS_THEME_TOKENS[osTheme];
  const thVars     = themeToVars(th) as React.CSSProperties;

  const devices  = useRackStore(s => s.devices);
  const vmTypes  = useTypesStore(s => s.vmTypes);
  const appTypes = useTypesStore(s => s.appTypes);

  const [tab, setTab]     = useState<OsTab>('stacks');
  const [viewMode, setViewMode] = useState<'block' | 'list'>('block');
  const [loading, setLoading]   = useState(true);

  const [hosts, setHosts] = useState<OsHost[]>([]);
  const [vms, setVms]     = useState<OsVm[]>([]);
  const [apps, setApps]   = useState<OsApp[]>([]);

  // Modals for list view edit callbacks
  const [hostModal, setHostModal] = useState<{ open: boolean; initial?: OsHost | null }>({ open: false });
  const [vmModal, setVmModal]     = useState<{ open: boolean; initial?: OsVm | null }>({ open: false });
  const [appModal, setAppModal]   = useState<{ open: boolean; initial?: OsApp | null }>({ open: false });

  const siteId  = site?.id ?? '';
  const apiBase = `/api/sites/${siteId}`;

  useEffect(() => {
    if (!site) return;
    setLoading(true);
    Promise.all([
      api.get<OsHost[]>(`${apiBase}/os-hosts`),
      api.get<OsVm[]>(`${apiBase}/os-vms`),
      api.get<OsApp[]>(`${apiBase}/os-apps`),
    ])
      .then(([h, v, a]) => {
        setHosts(h ?? []);
        setVms(v ?? []);
        setApps(a ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [site?.id]);

  // ── List view save helpers ──────────────────────────────────────────────────
  async function saveHostFromList(data: Omit<OsHost, 'id' | 'orgId' | 'siteId' | 'createdAt'>) {
    const method = hostModal.initial ? 'PATCH' : 'POST';
    const url = hostModal.initial ? `${apiBase}/os-hosts/${hostModal.initial.id}` : `${apiBase}/os-hosts`;
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'save failed');
    if (hostModal.initial) setHosts(p => p.map(x => x.id === body.id ? body : x));
    else setHosts(p => [...p, body]);
  }

  async function saveVmFromList(data: Omit<OsVm, 'id' | 'orgId' | 'siteId' | 'createdAt'>) {
    const method = vmModal.initial ? 'PATCH' : 'POST';
    const url = vmModal.initial ? `${apiBase}/os-vms/${vmModal.initial.id}` : `${apiBase}/os-vms`;
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'save failed');
    if (vmModal.initial) setVms(p => p.map(x => x.id === body.id ? body : x));
    else setVms(p => [...p, body]);
  }

  async function saveAppFromList(data: Omit<OsApp, 'id' | 'orgId' | 'siteId' | 'createdAt'>) {
    const method = appModal.initial ? 'PATCH' : 'POST';
    const url = appModal.initial ? `${apiBase}/os-apps/${appModal.initial.id}` : `${apiBase}/os-apps`;
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'save failed');
    if (appModal.initial) setApps(p => p.map(x => x.id === body.id ? body : x));
    else setApps(p => [...p, body]);
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      ...av,
      ...(css.vars as React.CSSProperties),
      ...thVars,
      background: th.pageBg,
      color: th.text,
    }}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .tpill:hover { filter: brightness(1.2); }
        .tab-wrap:hover .tab-btn-inner { color: var(--accent, #c47c5a) !important; }
        .st-row:hover td { background: var(--cardBg, #141618) !important; }
        .st-act-btn:hover { color: var(--text, #d4d9dd) !important; }
        .confirm-danger-btn:hover { background: #a85858 !important; border-color: #a85858 !important; }
        .wiz-input:focus { border-color: var(--accent, #c47c5a) !important; outline: none; }
      `}</style>

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        background: th.hdrBg, borderBottom: `1px solid ${th.hdrBorder}`,
        flexShrink: 0, padding: '0 8px 0 0',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', flex: 1 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab-wrap${tab === t.id ? ' active' : ''}`}
              style={{
                padding: '0 20px', height: 38, border: 'none',
                background: 'transparent', cursor: 'pointer',
                borderBottom: tab === t.id ? `2px solid ${accent}` : '2px solid transparent',
              }}
              onClick={() => setTab(t.id)}
            >
              <span
                className="tab-btn-inner"
                style={{
                  fontFamily: th.fontMain, fontSize: 12,
                  color: tab === t.id ? accent : th.text2,
                }}
              >{t.label}</span>
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: 2, marginRight: 12 }}>
          {(['block', 'list'] as const).map(m => (
            <button
              key={m}
              style={{
                padding: '3px 10px', borderRadius: 3,
                border: `1px solid ${th.border2}`,
                background: viewMode === m ? th.border2 : 'transparent',
                color: viewMode === m ? th.text : th.text3,
                fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
              }}
              onClick={() => setViewMode(m)}
            >{m}</button>
          ))}
        </div>

        {/* Theme switcher */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}>theme</span>
          <select
            value={osTheme}
            onChange={e => setOsTheme(e.target.value as OsThemeMode)}
            style={{
              padding: '3px 8px', borderRadius: 3, border: `1px solid ${th.border2}`,
              background: th.inputBg, color: th.text2,
              fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
            }}
          >
            {THEME_MODES.map(m => (
              <option key={m} value={m}>
                {OS_THEME_LABELS[m]}
              </option>
            ))}
          </select>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: OS_THEME_DOT_COLOR[osTheme],
            display: 'inline-block',
          }} />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{
          padding: 32, fontFamily: th.fontData, fontSize: 11, color: th.text3,
        }}>loading…</div>
      ) : viewMode === 'list' ? (
        <OsListView
          hosts={hosts}
          vms={vms}
          apps={apps}
          devices={devices}
          vmTypes={vmTypes}
          appTypes={appTypes}
          th={th}
          accent={accent}
          onEditHost={host => setHostModal({ open: true, initial: host })}
          onEditVm={vm => setVmModal({ open: true, initial: vm })}
          onEditApp={app => setAppModal({ open: true, initial: app })}
        />
      ) : (
        <>
          {tab === 'stacks' && (
            <OsStacksTab
              hosts={hosts}
              vms={vms}
              apps={apps}
              devices={devices}
              vmTypes={vmTypes}
              appTypes={appTypes}
              th={th}
              accent={accent}
              siteId={siteId}
              apiBase={apiBase}
              onHostAdd={h => setHosts(p => [...p, h])}
              onHostUpdate={h => setHosts(p => p.map(x => x.id === h.id ? h : x))}
              onVmAdd={v => setVms(p => [...p, v])}
              onVmUpdate={v => setVms(p => p.map(x => x.id === v.id ? v : x))}
              onVmDelete={id => setVms(p => p.filter(x => x.id !== id))}
              onAppAdd={a => setApps(p => [...p, a])}
              onAppUpdate={a => setApps(p => p.map(x => x.id === a.id ? a : x))}
              onAppDelete={id => setApps(p => p.filter(x => x.id !== id))}
            />
          )}
          {tab === 'vms' && (
            <OsVmsTab
              vms={vms}
              hosts={hosts}
              apps={apps}
              devices={devices}
              vmTypes={vmTypes}
              appTypes={appTypes}
              th={th}
              accent={accent}
              apiBase={apiBase}
              onVmAdd={v => setVms(p => [...p, v])}
              onVmUpdate={v => setVms(p => p.map(x => x.id === v.id ? v : x))}
              onVmDelete={id => setVms(p => p.filter(x => x.id !== id))}
            />
          )}
          {tab === 'apps' && (
            <OsAppsTab
              apps={apps}
              vms={vms}
              hosts={hosts}
              devices={devices}
              appTypes={appTypes}
              th={th}
              accent={accent}
              apiBase={apiBase}
              onAppAdd={a => setApps(p => [...p, a])}
              onAppUpdate={a => setApps(p => p.map(x => x.id === a.id ? a : x))}
              onAppDelete={id => setApps(p => p.filter(x => x.id !== id))}
            />
          )}
        </>
      )}

      {/* List view edit modals */}
      <HostEditorModal
        open={hostModal.open}
        initial={hostModal.initial}
        devices={devices}
        th={th}
        accent={accent}
        onSave={saveHostFromList}
        onClose={() => setHostModal({ open: false })}
      />
      <VmEditorModal
        open={vmModal.open}
        initial={vmModal.initial}
        hosts={hosts}
        vms={vms}
        vmTypes={vmTypes}
        th={th}
        accent={accent}
        onSave={saveVmFromList}
        onClose={() => setVmModal({ open: false })}
      />
      <AppEditorModal
        open={appModal.open}
        initial={appModal.initial}
        vms={vms}
        hosts={hosts}
        appTypes={appTypes}
        th={th}
        accent={accent}
        onSave={saveAppFromList}
        onClose={() => setAppModal({ open: false })}
      />
    </div>
  );
}
