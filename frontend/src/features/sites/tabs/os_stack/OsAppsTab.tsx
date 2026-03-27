import { useState } from 'react';
import type { OsApp, OsVm, OsHost, DeviceInstance, AppType } from '@werkstack/shared';
import type { OsThemeTokens } from '../../../../store/useThemeStore';
import { AppEditorModal } from './AppEditorModal';
import { sanitizeUrl } from '../../../../utils/sanitize';

interface Props {
  apps:     OsApp[];
  vms:      OsVm[];
  hosts:    OsHost[];
  devices:  DeviceInstance[];
  appTypes: AppType[];
  th:       OsThemeTokens;
  accent:   string;
  apiBase:  string;
  onAppAdd:    (a: OsApp) => void;
  onAppUpdate: (a: OsApp) => void;
  onAppDelete: (id: string) => void;
}

type FilterSet = Set<string> | null;

function toggleFilter(s: FilterSet, id: string, allIds: string[]): FilterSet {
  if (s === null) return new Set(allIds.filter(x => x !== id));
  const next = new Set(s);
  if (next.has(id)) { next.delete(id); } else {
    next.add(id);
    if (next.size === allIds.length) return null;
  }
  return next.size === 0 ? new Set<string>() : next;
}

export function OsAppsTab({
  apps, vms, hosts, devices, appTypes, th, accent, apiBase,
  onAppAdd, onAppUpdate, onAppDelete,
}: Props) {
  const [modal, setModal]           = useState<{ open: boolean; initial?: OsApp | null }>({ open: false });
  const [typeFilter, setTypeFilter] = useState<FilterSet>(null);
  const [confirm, setConfirm]       = useState<string | null>(null);

  const appTypeMap = Object.fromEntries(appTypes.map(t => [t.id, t]));
  const vmMap      = Object.fromEntries(vms.map(v => [v.id, v]));
  const hostMap    = Object.fromEntries(hosts.map(h => [h.id, h]));
  const deviceMap  = Object.fromEntries(devices.map(d => [d.id, d]));

  const allTypeIds = [...new Set(apps.map(a => a.typeId))];

  const filtered = apps.filter(a =>
    typeFilter === null || typeFilter.has(a.typeId)
  );

  async function saveApp(data: Omit<OsApp, 'id' | 'orgId' | 'siteId' | 'createdAt'>) {
    const method = modal.initial ? 'PATCH' : 'POST';
    const url = modal.initial
      ? `${apiBase}/os-apps/${modal.initial.id}`
      : `${apiBase}/os-apps`;
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'save failed');
    if (modal.initial) onAppUpdate(body);
    else onAppAdd(body);
  }

  async function doDelete(id: string) {
    const res = await fetch(`${apiBase}/os-apps/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) onAppDelete(id);
    setConfirm(null);
  }

  function getParentLabel(app: OsApp): string {
    if (app.vmId) {
      const vm = vmMap[app.vmId];
      return vm ? vm.name : '—';
    }
    if (app.hostId) {
      const host = hostMap[app.hostId];
      if (!host) return '—';
      const device = deviceMap[host.deviceId];
      return device ? `${device.name} (bare metal)` : host.hostOs;
    }
    return '—';
  }

  const pillStyle = (color: string) => ({
    display: 'inline-block', padding: '1px 6px', borderRadius: 3,
    background: color + '28', border: `1px solid ${color}40`,
    color, fontFamily: th.fontLabel, fontSize: 9,
    textTransform: 'uppercase' as const,
  });

  const thStyle = {
    padding: '5px 12px', fontFamily: th.fontLabel, fontSize: 10,
    color: th.text3, textTransform: 'uppercase' as const,
    borderBottom: `1px solid ${th.border2}`, textAlign: 'left' as const,
  };
  const tdStyle = {
    padding: '7px 12px', borderBottom: `1px solid ${th.border}`,
    fontFamily: th.fontData, fontSize: 11, color: th.text,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        borderBottom: `1px solid ${th.border2}`, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <button
          className="act-primary"
          style={{
            padding: '5px 14px', borderRadius: 4, border: 'none',
            background: accent, color: '#fff', fontFamily: th.fontMain,
            fontSize: 11, cursor: 'pointer',
          }}
          onClick={() => setModal({ open: true, initial: null })}
        >+ add app</button>

        <div style={{ width: 1, background: th.border2, height: 20 }} />

        <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}>type</span>
        <button
          className={`rpill${typeFilter === null ? ' on' : ''}`}
          style={{
            padding: '2px 10px', borderRadius: 12, border: `1px solid ${th.border2}`,
            background: typeFilter === null ? accent : 'transparent',
            color: typeFilter === null ? '#fff' : th.text2,
            fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
          }}
          onClick={() => setTypeFilter(typeFilter === null ? new Set() : null)}
        >all</button>
        {allTypeIds.map(tid => {
          const t   = appTypeMap[tid];
          const isOn = typeFilter === null || typeFilter.has(tid);
          return (
            <button
              key={tid}
              className={`rpill${isOn ? ' on' : ''}`}
              style={{
                padding: '2px 10px', borderRadius: 12, border: `1px solid ${th.border2}`,
                background: isOn ? accent : 'transparent',
                color: isOn ? '#fff' : th.text2,
                fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
              }}
              onClick={() => setTypeFilter(toggleFilter(typeFilter, tid, allTypeIds))}
            >{t?.name ?? tid}</button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: th.hdrBg }}>
              <th style={thStyle}>name</th>
              <th style={thStyle}>type</th>
              <th style={thStyle}>runs on</th>
              <th style={thStyle}>version</th>
              <th style={thStyle}>ip / port</th>
              <th style={thStyle}>url</th>
              <th style={{ ...thStyle, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(app => {
              const at = appTypeMap[app.typeId];
              const safeUrl = app.url ? sanitizeUrl(app.url) : null;
              return (
                <tr key={app.id} className="st-row" style={{ background: th.rowBg }}>
                  <td style={tdStyle}>{app.name}</td>
                  <td style={tdStyle}>
                    {at && <span style={pillStyle(th.appTint)}>{at.name}</span>}
                  </td>
                  <td style={{ ...tdStyle, color: th.text2 }}>{getParentLabel(app)}</td>
                  <td style={{ ...tdStyle, color: th.text3 }}>
                    {app.version ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, color: th.text2, fontFamily: th.fontData }}>
                    {app.ip ?? '—'}
                  </td>
                  <td style={tdStyle}>
                    {safeUrl && safeUrl !== '#' ? (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: th.blue, fontFamily: th.fontData, fontSize: 11 }}
                      >{safeUrl}</a>
                    ) : '—'}
                  </td>
                  <td style={{ ...tdStyle, padding: '4px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="st-act-btn"
                        style={{
                          padding: '3px 10px', borderRadius: 3, border: `1px solid ${th.border2}`,
                          background: 'transparent', color: th.text3,
                          fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
                        }}
                        onClick={() => setModal({ open: true, initial: app })}
                      >edit</button>
                      <button
                        className="st-act-btn"
                        style={{
                          padding: '3px 8px', borderRadius: 3, border: `1px solid ${th.border2}`,
                          background: 'transparent', color: th.red,
                          fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
                        }}
                        onClick={() => setConfirm(app.id)}
                      >×</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{
            padding: 32, textAlign: 'center',
            fontFamily: th.fontData, fontSize: 12, color: th.text3,
          }}>
            {apps.length === 0 ? 'no applications yet — add one to get started' : 'no apps match the current filters'}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: th.cardBg, border: `1px solid ${th.border2}`,
            borderRadius: 6, padding: 24, width: 320,
          }}>
            <div style={{ fontFamily: th.fontMain, fontSize: 13, color: th.text, marginBottom: 8 }}>
              delete application?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn-ghost"
                style={{
                  padding: '5px 14px', borderRadius: 4, border: `1px solid ${th.border2}`,
                  background: 'transparent', color: th.text2, fontFamily: th.fontMain,
                  fontSize: 12, cursor: 'pointer',
                }}
                onClick={() => setConfirm(null)}
              >cancel</button>
              <button
                className="confirm-danger-btn"
                style={{
                  padding: '5px 14px', borderRadius: 4, border: 'none',
                  background: th.red, color: '#fff', fontFamily: th.fontMain,
                  fontSize: 12, cursor: 'pointer',
                }}
                onClick={() => doDelete(confirm)}
              >delete</button>
            </div>
          </div>
        </div>
      )}

      <AppEditorModal
        open={modal.open}
        initial={modal.initial}
        vms={vms}
        hosts={hosts}
        appTypes={appTypes}
        th={th}
        accent={accent}
        onSave={saveApp}
        onClose={() => setModal({ open: false })}
      />
    </div>
  );
}
