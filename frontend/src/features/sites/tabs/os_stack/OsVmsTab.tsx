import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OsVm, OsHost, DeviceInstance, VmType, AppType, OsApp } from '@werkstack/shared';
import type { OsThemeTokens } from '../../../../store/useThemeStore';
import { VmEditorModal } from './VmEditorModal';
import { api } from '../../../../utils/api';

interface Props {
  vms:         OsVm[];
  hosts:       OsHost[];
  apps:        OsApp[];
  devices:     DeviceInstance[];
  vmTypes:     VmType[];
  appTypes:    AppType[];
  th:          OsThemeTokens;
  accent:      string;
  siteId:      string;
  apiBase:     string;
  guideCounts: Record<string, number>;
  onVmAdd:    (v: OsVm) => void;
  onVmUpdate: (v: OsVm) => void;
  onVmDelete: (id: string) => void;
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

export function OsVmsTab({
  vms, hosts, apps, devices, vmTypes, th, accent, siteId, apiBase, guideCounts,
  onVmAdd, onVmUpdate, onVmDelete,
}: Props) {
  const navigate = useNavigate();
  const [modal, setModal]           = useState<{ open: boolean; initial?: OsVm | null }>({ open: false });
  const [osFilter, setOsFilter]     = useState<FilterSet>(null);
  const [typeFilter, setTypeFilter] = useState<FilterSet>(null);
  const [confirm, setConfirm]       = useState<string | null>(null);
  const [guidePopup, setGuidePopup] = useState<{ vmId: string; guides: { id: string; guideTitle?: string }[] } | null>(null);

  const vmTypeMap    = Object.fromEntries(vmTypes.map(t => [t.id, t]));
  const hostMap      = Object.fromEntries(hosts.map(h => [h.id, h]));
  const deviceMap    = Object.fromEntries(devices.map(d => [d.id, d]));

  // Unique OS strings for filter pills
  const allOsValues = [...new Set(vms.map(v => v.vmOs).filter(Boolean) as string[])];
  const allTypeIds  = [...new Set(vms.map(v => v.typeId))];

  const filtered = vms.filter(v => {
    if (osFilter !== null && !osFilter.has(v.vmOs ?? '')) return false;
    if (typeFilter !== null && !typeFilter.has(v.typeId)) return false;
    return true;
  });

  async function saveVm(data: Omit<OsVm, 'id' | 'orgId' | 'siteId' | 'createdAt'>) {
    const method = modal.initial ? 'PATCH' : 'POST';
    const url = modal.initial
      ? `${apiBase}/os-vms/${modal.initial.id}`
      : `${apiBase}/os-vms`;
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'save failed');
    if (modal.initial) onVmUpdate(body);
    else onVmAdd(body);
  }

  async function doDelete(id: string) {
    const res = await fetch(`${apiBase}/os-vms/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) onVmDelete(id);
    setConfirm(null);
  }

  const thStyle = {
    padding: '5px 12px', fontFamily: th.fontLabel, fontSize: 10,
    color: th.text3, textTransform: 'uppercase' as const,
    borderBottom: `1px solid ${th.border2}`, textAlign: 'left' as const,
  };
  const tdStyle = {
    padding: '7px 12px', borderBottom: `1px solid ${th.border}`,
    fontFamily: th.fontData, fontSize: 11, color: th.text,
  };

  const pillStyle = (color: string) => ({
    display: 'inline-block', padding: '1px 6px', borderRadius: 3,
    background: color + '28', border: `1px solid ${color}40`,
    color, fontFamily: th.fontLabel, fontSize: 9,
    textTransform: 'uppercase' as const,
  });

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
        >+ add vm</button>

        <div style={{ width: 1, background: th.border2, height: 20 }} />

        {/* Type filter */}
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
          const t = vmTypeMap[tid];
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

        {allOsValues.length > 0 && (
          <>
            <div style={{ width: 1, background: th.border2, height: 20 }} />
            <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}>os</span>
            <button
              className={`rpill${osFilter === null ? ' on' : ''}`}
              style={{
                padding: '2px 10px', borderRadius: 12, border: `1px solid ${th.border2}`,
                background: osFilter === null ? accent : 'transparent',
                color: osFilter === null ? '#fff' : th.text2,
                fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
              }}
              onClick={() => setOsFilter(osFilter === null ? new Set() : null)}
            >all</button>
            {allOsValues.map(os => {
              const isOn = osFilter === null || osFilter.has(os);
              return (
                <button
                  key={os}
                  className={`rpill${isOn ? ' on' : ''}`}
                  style={{
                    padding: '2px 10px', borderRadius: 12, border: `1px solid ${th.border2}`,
                    background: isOn ? accent : 'transparent',
                    color: isOn ? '#fff' : th.text2,
                    fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
                  }}
                  onClick={() => setOsFilter(toggleFilter(osFilter, os, allOsValues))}
                >{os}</button>
              );
            })}
          </>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: th.hdrBg }}>
              <th style={thStyle}>name</th>
              <th style={thStyle}>type</th>
              <th style={thStyle}>host</th>
              <th style={thStyle}>os</th>
              <th style={thStyle}>cpu / ram</th>
              <th style={thStyle}>ip</th>
              <th style={thStyle}>apps</th>
              <th style={{ ...thStyle, width: 60 }}>guides</th>
              <th style={{ ...thStyle, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(vm => {
              const vmt     = vmTypeMap[vm.typeId];
              const host    = hostMap[vm.hostId];
              const device  = host ? deviceMap[host.deviceId] : undefined;
              const appCount = apps.filter(a => a.vmId === vm.id).length;
              return (
                <tr
                  key={vm.id}
                  className="st-row"
                  style={{ background: th.rowBg }}
                >
                  <td style={tdStyle}>{vm.name}</td>
                  <td style={tdStyle}>
                    {vmt && <span style={pillStyle(th.vmTint)}>{vmt.name}</span>}
                  </td>
                  <td style={{ ...tdStyle, color: th.text2 }}>
                    {device?.name ?? host?.hostOs ?? '—'}
                  </td>
                  <td style={tdStyle}>
                    {vm.vmOs ?? <span style={{ color: th.text3 }}>—</span>}
                    {vm.osVersion && (
                      <span style={{ color: th.text3, marginLeft: 4 }}>{vm.osVersion}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: th.text2 }}>
                    {[vm.cpus != null ? `${vm.cpus}c` : null, vm.ramGb != null ? `${vm.ramGb}GB` : null]
                      .filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td style={{ ...tdStyle, color: th.text2, fontFamily: th.fontData }}>
                    {vm.ip ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, color: appCount > 0 ? th.appTint : th.text3 }}>
                    {appCount > 0 ? appCount : '—'}
                  </td>
                  <td style={{ ...tdStyle, padding: '4px 12px', position: 'relative' }}>
                    {(guideCounts[vm.id] ?? 0) > 0 ? (
                      <button
                        onClick={async () => {
                          const data = await api.get<{ id: string; guideTitle?: string }[]>(
                            `/api/sites/${siteId}/guide-links?entityType=vm&entityId=${vm.id}`
                          ).catch(() => []);
                          setGuidePopup({ vmId: vm.id, guides: data ?? [] });
                        }}
                        style={{
                          padding: '2px 7px', borderRadius: 10,
                          background: '#c47c5a18', border: '1px solid #c47c5a40',
                          color: '#c47c5a', cursor: 'pointer',
                          fontFamily: th.fontLabel, fontSize: 10,
                        }}
                      >
                        {guideCounts[vm.id]}
                      </button>
                    ) : (
                      <span style={{ color: th.text3, fontFamily: th.fontData, fontSize: 10 }}>—</span>
                    )}
                    {guidePopup?.vmId === vm.id && (
                      <div style={{
                        position: 'absolute', bottom: '100%', left: 0, zIndex: 300,
                        background: 'var(--cardBg, #141618)', border: '1px solid var(--border2, #262c30)',
                        borderRadius: 6, padding: '4px 0', minWidth: 180,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      }}>
                        {guidePopup.guides.map(g => (
                          <button
                            key={g.id}
                            onClick={() => { navigate(`/sites/${siteId}/guides?guideId=${g.id}`); setGuidePopup(null); }}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '6px 12px', background: 'transparent', border: 'none',
                              cursor: 'pointer', fontFamily: th.fontLabel, fontSize: 10,
                              color: th.text2,
                            }}
                          >
                            {g.guideTitle ?? g.id.slice(0, 8) + '…'}
                          </button>
                        ))}
                        <button
                          onClick={() => setGuidePopup(null)}
                          style={{ display: 'block', width: '100%', textAlign: 'center', padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: th.fontLabel, fontSize: 9, color: th.text3 }}
                        >close</button>
                      </div>
                    )}
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
                        onClick={() => setModal({ open: true, initial: vm })}
                      >edit</button>
                      <button
                        className="st-act-btn"
                        style={{
                          padding: '3px 8px', borderRadius: 3, border: `1px solid ${th.border2}`,
                          background: 'transparent', color: th.red,
                          fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
                        }}
                        onClick={() => setConfirm(vm.id)}
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
            {vms.length === 0 ? 'no vms yet — add one to get started' : 'no vms match the current filters'}
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
            borderRadius: 6, padding: 24, width: 340,
          }}>
            <div style={{ fontFamily: th.fontMain, fontSize: 13, color: th.text, marginBottom: 8 }}>
              delete vm?
            </div>
            <div style={{ fontFamily: th.fontData, fontSize: 11, color: th.text3, marginBottom: 20 }}>
              this will also delete all apps assigned to this vm.
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

      <VmEditorModal
        open={modal.open}
        initial={modal.initial}
        hosts={hosts}
        vms={vms}
        vmTypes={vmTypes}
        th={th}
        accent={accent}
        onSave={saveVm}
        onClose={() => setModal({ open: false })}
      />
    </div>
  );
}
