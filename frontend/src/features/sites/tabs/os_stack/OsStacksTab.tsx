import { useState } from 'react';
import type {
  OsHost, OsVm, OsApp, DeviceInstance, VmType, AppType,
} from '@werkstack/shared';
import type { OsThemeTokens } from '../../../../store/useThemeStore';
import { HostEditorModal } from './HostEditorModal';
import { VmEditorModal }   from './VmEditorModal';
import { AppEditorModal }  from './AppEditorModal';

interface Props {
  hosts:      OsHost[];
  vms:        OsVm[];
  apps:       OsApp[];
  devices:    DeviceInstance[];
  vmTypes:    VmType[];
  appTypes:   AppType[];
  th:         OsThemeTokens;
  accent:     string;
  siteId:     string;
  onHostAdd:    (h: OsHost) => void;
  onHostUpdate: (h: OsHost) => void;
  onVmAdd:      (v: OsVm) => void;
  onVmUpdate:   (v: OsVm) => void;
  onVmDelete:   (id: string) => void;
  onAppAdd:     (a: OsApp) => void;
  onAppUpdate:  (a: OsApp) => void;
  onAppDelete:  (id: string) => void;
  apiBase:    string;
}

// ── Filter state helpers ──────────────────────────────────────────────────────
type FilterSet = Set<string> | null;

function toggleFilter(s: FilterSet, id: string, allIds: string[]): FilterSet {
  if (s === null) {
    // all → remove one → Set of all others
    return new Set(allIds.filter(x => x !== id));
  }
  const next = new Set(s);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
    if (next.size === allIds.length) return null;
  }
  return next.size === 0 ? new Set<string>() : next;
}

// ── StackBlock card ───────────────────────────────────────────────────────────

interface StackBlockProps {
  device:  DeviceInstance;
  host:    OsHost | undefined;
  vms:     OsVm[];
  apps:    OsApp[];
  vmTypes: VmType[];
  appTypes: AppType[];
  th:      OsThemeTokens;
  accent:  string;
  onConfigureHost: () => void;
  onEditHost:      () => void;
  onAddVm:         () => void;
  onEditVm:        (vm: OsVm) => void;
  onDeleteVm:      (id: string) => void;
  onAddApp:        (vmId?: string, hostId?: string) => void;
  onEditApp:       (app: OsApp) => void;
  onDeleteApp:     (id: string) => void;
}

function StackBlock({
  device, host, vms, apps, vmTypes, appTypes, th, accent,
  onConfigureHost, onEditHost, onAddVm, onEditVm, onDeleteVm,
  onAddApp, onEditApp, onDeleteApp,
}: StackBlockProps) {
  const hostVms = vms.filter(v => v.hostId === host?.id);
  const bareApps = apps.filter(a => a.hostId === host?.id && !a.vmId);

  const vmTypeMap = Object.fromEntries(vmTypes.map(t => [t.id, t]));
  const appTypeMap = Object.fromEntries(appTypes.map(t => [t.id, t]));

  const pillStyle = (color: string) => ({
    display: 'inline-block', padding: '1px 6px', borderRadius: 3,
    background: color + '28', border: `1px solid ${color}40`,
    color, fontFamily: th.fontLabel, fontSize: 9,
    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
    marginRight: 4,
  });

  const iconBtn = (label: string, color: string, onClick: () => void) => (
    <button
      style={{
        padding: '2px 8px', borderRadius: 3, border: `1px solid ${th.border2}`,
        background: 'transparent', color, fontFamily: th.fontLabel,
        fontSize: 10, cursor: 'pointer',
      }}
      onClick={onClick}
    >{label}</button>
  );

  return (
    <div style={{
      background: th.cardBg, border: `1px solid ${th.border}`,
      borderRadius: 6, overflow: 'hidden', minWidth: 320,
    }}>
      {/* Device header */}
      <div style={{
        padding: '8px 12px', background: th.hdrBg,
        borderBottom: `1px solid ${th.hdrBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: th.fontMain, fontSize: 12, color: th.hdrText, fontWeight: 600 }}>
            {device.name}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {host
            ? iconBtn('edit host', th.text3, onEditHost)
            : iconBtn('+ host os', accent, onConfigureHost)
          }
        </div>
      </div>

      {/* Infra row */}
      <div style={{
        padding: '4px 12px', background: th.infraBg,
        borderBottom: `1px solid ${th.border}`,
        display: 'flex', gap: 12, alignItems: 'center',
      }}>
        {device.rackId && (
          <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>
            {device.rackU != null ? `U${device.rackU}` : 'rack'}
          </span>
        )}
        {device.ip && (
          <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>
            {device.ip}
          </span>
        )}
        {device.serial && (
          <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>
            s/n: {device.serial}
          </span>
        )}
        {!device.rackId && !device.ip && !device.serial && (
          <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>infrastructure</span>
        )}
      </div>

      {/* Host OS row */}
      {host && (
        <div style={{
          padding: '5px 12px', background: th.hostTint + '18',
          borderBottom: `1px solid ${th.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ ...pillStyle(th.hostTint) }}>host</span>
          <span style={{ fontFamily: th.fontData, fontSize: 11, color: th.text }}>
            {host.hostOs}{host.osVersion ? ` ${host.osVersion}` : ''}
          </span>
          {host.kernel && (
            <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>
              · {host.kernel}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {iconBtn('+ vm', th.vmTint, onAddVm)}
            {iconBtn('+ app', th.appTint, () => onAddApp(undefined, host.id))}
          </div>
        </div>
      )}

      {/* VM columns area */}
      {(hostVms.length > 0 || bareApps.length > 0) && (
        <div style={{
          display: 'flex', gap: 0, overflowX: 'auto',
          borderBottom: hostVms.length > 0 || bareApps.length > 0 ? `1px solid ${th.border}` : undefined,
        }}>
          {/* VM columns */}
          {hostVms.map(vm => {
            const vmApps = apps.filter(a => a.vmId === vm.id);
            const vmt = vmTypeMap[vm.typeId];
            return (
              <div key={vm.id} style={{
                minWidth: 180, borderRight: `1px solid ${th.border}`,
                background: th.vmTint + '0e',
                flex: '0 0 auto',
              }}>
                {/* VM header */}
                <div style={{
                  padding: '5px 10px', background: th.vmTint + '20',
                  borderBottom: `1px solid ${th.vmTint}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <span style={{ fontFamily: th.fontMain, fontSize: 11, color: th.text, display: 'block' }}>
                      {vm.name}
                    </span>
                    {vmt && (
                      <span style={{ ...pillStyle(th.vmTint), marginRight: 0 }}>{vmt.name}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={{
                        padding: '1px 6px', borderRadius: 3, border: `1px solid ${th.border2}`,
                        background: 'transparent', color: th.text3,
                        fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
                      }}
                      onClick={() => onEditVm(vm)}
                    >edit</button>
                    <button
                      style={{
                        padding: '1px 6px', borderRadius: 3, border: `1px solid ${th.border2}`,
                        background: 'transparent', color: th.red,
                        fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
                      }}
                      onClick={() => onDeleteVm(vm.id)}
                    >×</button>
                  </div>
                </div>
                {/* VM info */}
                <div style={{ padding: '4px 10px', borderBottom: `1px solid ${th.border}` }}>
                  {vm.vmOs && (
                    <div style={{ fontFamily: th.fontData, fontSize: 10, color: th.text2 }}>
                      {vm.vmOs}{vm.osVersion ? ` ${vm.osVersion}` : ''}
                    </div>
                  )}
                  <div style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3, display: 'flex', gap: 8 }}>
                    {vm.cpus != null && <span>{vm.cpus}c</span>}
                    {vm.ramGb != null && <span>{vm.ramGb}GB</span>}
                    {vm.ip && <span>{vm.ip}</span>}
                  </div>
                </div>
                {/* VM apps */}
                <div style={{ padding: '4px 10px' }}>
                  {vmApps.map(app => {
                    const at = appTypeMap[app.typeId];
                    return (
                      <div key={app.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '2px 0', borderBottom: `1px solid ${th.border}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ ...pillStyle(th.appTint), fontSize: 8 }}>
                            {at?.name ?? app.typeId}
                          </span>
                          <span style={{ fontFamily: th.fontData, fontSize: 11, color: th.text }}>
                            {app.name}
                          </span>
                          {app.version && (
                            <span style={{ fontFamily: th.fontData, fontSize: 9, color: th.text3 }}>
                              v{app.version}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button
                            style={{
                              padding: '1px 5px', borderRadius: 2, border: `1px solid ${th.border2}`,
                              background: 'transparent', color: th.text3,
                              fontFamily: th.fontLabel, fontSize: 9, cursor: 'pointer',
                            }}
                            onClick={() => onEditApp(app)}
                          >e</button>
                          <button
                            style={{
                              padding: '1px 5px', borderRadius: 2, border: `1px solid ${th.border2}`,
                              background: 'transparent', color: th.red,
                              fontFamily: th.fontLabel, fontSize: 9, cursor: 'pointer',
                            }}
                            onClick={() => onDeleteApp(app.id)}
                          >×</button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    style={{
                      display: 'block', width: '100%', marginTop: 4,
                      padding: '2px 0', borderRadius: 3,
                      border: `1px dashed ${th.border2}`,
                      background: 'transparent', color: th.text3,
                      fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer', textAlign: 'center',
                    }}
                    onClick={() => onAddApp(vm.id, undefined)}
                  >+ app</button>
                </div>
              </div>
            );
          })}

          {/* Bare metal apps column */}
          {bareApps.length > 0 && (
            <div style={{ minWidth: 160, padding: '8px 10px', flex: '0 0 auto' }}>
              <div style={{
                fontFamily: th.fontLabel, fontSize: 9, color: th.text3,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
              }}>bare metal</div>
              {bareApps.map(app => {
                const at = appTypeMap[app.typeId];
                return (
                  <div key={app.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '2px 0', borderBottom: `1px solid ${th.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ ...pillStyle(th.appTint), fontSize: 8 }}>
                        {at?.name ?? app.typeId}
                      </span>
                      <span style={{ fontFamily: th.fontData, fontSize: 11, color: th.text }}>
                        {app.name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button
                        style={{
                          padding: '1px 5px', borderRadius: 2, border: `1px solid ${th.border2}`,
                          background: 'transparent', color: th.text3,
                          fontFamily: th.fontLabel, fontSize: 9, cursor: 'pointer',
                        }}
                        onClick={() => onEditApp(app)}
                      >e</button>
                      <button
                        style={{
                          padding: '1px 5px', borderRadius: 2, border: `1px solid ${th.border2}`,
                          background: 'transparent', color: th.red,
                          fontFamily: th.fontLabel, fontSize: 9, cursor: 'pointer',
                        }}
                        onClick={() => onDeleteApp(app.id)}
                      >×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state for unconfigured device */}
      {!host && (
        <div style={{ padding: '10px 12px', textAlign: 'center' }}>
          <span style={{ fontFamily: th.fontData, fontSize: 11, color: th.text3 }}>
            no host os configured
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main OsStacksTab ──────────────────────────────────────────────────────────

export function OsStacksTab({
  hosts, vms, apps, devices, vmTypes, appTypes, th, accent,
  onHostAdd, onHostUpdate, onVmAdd, onVmUpdate, onVmDelete,
  onAppAdd, onAppUpdate, onAppDelete, apiBase,
}: Props) {
  const [hostModal, setHostModal]     = useState<{ open: boolean; initial?: OsHost | null; device?: DeviceInstance }>({ open: false });
  const [vmModal, setVmModal]         = useState<{ open: boolean; initial?: OsVm | null; defaultHostId?: string }>({ open: false });
  const [appModal, setAppModal]       = useState<{ open: boolean; initial?: OsApp | null; defaultVmId?: string; defaultHostId?: string }>({ open: false });

  // Filter state
  const [deviceFilter, setDeviceFilter] = useState<FilterSet>(null);

  const allDeviceIds = devices.map(d => d.id);

  // Filtered device list — only show devices that have a host or are active in filter
  const visibleDevices = devices.filter(d =>
    deviceFilter === null || deviceFilter.has(d.id)
  );

  // ── Modal save handlers ────────────────────────────────────────────────────
  async function saveHost(data: Omit<OsHost, 'id' | 'orgId' | 'siteId' | 'createdAt'>) {
    const existing = hosts.find(h => h.deviceId === data.deviceId);
    if (existing && !hostModal.initial) {
      // upsert via POST
    }
    const method = hostModal.initial ? 'PATCH' : 'POST';
    const url = hostModal.initial
      ? `${apiBase}/os-hosts/${hostModal.initial.id}`
      : `${apiBase}/os-hosts`;
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'save failed');
    if (hostModal.initial) onHostUpdate(body);
    else onHostAdd(body);
  }

  async function saveVm(data: Omit<OsVm, 'id' | 'orgId' | 'siteId' | 'createdAt'>) {
    const method = vmModal.initial ? 'PATCH' : 'POST';
    const url = vmModal.initial
      ? `${apiBase}/os-vms/${vmModal.initial.id}`
      : `${apiBase}/os-vms`;
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'save failed');
    if (vmModal.initial) onVmUpdate(body);
    else onVmAdd(body);
  }

  async function saveApp(data: Omit<OsApp, 'id' | 'orgId' | 'siteId' | 'createdAt'>) {
    const method = appModal.initial ? 'PATCH' : 'POST';
    const url = appModal.initial
      ? `${apiBase}/os-apps/${appModal.initial.id}`
      : `${apiBase}/os-apps`;
    const res = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'save failed');
    if (appModal.initial) onAppUpdate(body);
    else onAppAdd(body);
  }

  async function deleteVm(id: string) {
    const res = await fetch(`${apiBase}/os-vms/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) return;
    onVmDelete(id);
  }

  async function deleteApp(id: string) {
    const res = await fetch(`${apiBase}/os-apps/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) return;
    onAppDelete(id);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 6, padding: '10px 16px', flexShrink: 0,
        borderBottom: `1px solid ${th.border2}`, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginRight: 4 }}>device</span>
        <button
          className={`rpill${deviceFilter === null ? ' on' : ''}`}
          style={{
            padding: '2px 10px', borderRadius: 12, border: `1px solid ${th.border2}`,
            background: deviceFilter === null ? accent : 'transparent',
            color: deviceFilter === null ? '#fff' : th.text2,
            fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
          }}
          onClick={() => setDeviceFilter(deviceFilter === null ? new Set() : null)}
        >all</button>
        {devices.map(d => {
          const isOn = deviceFilter === null || deviceFilter.has(d.id);
          return (
            <button
              key={d.id}
              className={`rpill${isOn ? ' on' : ''}`}
              style={{
                padding: '2px 10px', borderRadius: 12, border: `1px solid ${th.border2}`,
                background: isOn ? accent : 'transparent',
                color: isOn ? '#fff' : th.text2,
                fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer',
              }}
              onClick={() => setDeviceFilter(toggleFilter(deviceFilter, d.id, allDeviceIds))}
            >{d.name}</button>
          );
        })}
      </div>

      {/* StackBlock grid */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 16,
        display: 'flex', flexWrap: 'wrap', gap: 16, alignContent: 'flex-start',
      }}>
        {visibleDevices.map(device => {
          const host = hosts.find(h => h.deviceId === device.id);
          const hostVms = vms.filter(v => v.hostId === host?.id);
          const allHostApps = apps.filter(a =>
            (host && a.hostId === host.id) || hostVms.some(v => a.vmId === v.id)
          );
          return (
            <StackBlock
              key={device.id}
              device={device}
              host={host}
              vms={hostVms}
              apps={allHostApps}
              vmTypes={vmTypes}
              appTypes={appTypes}
              th={th}
              accent={accent}
              onConfigureHost={() => setHostModal({ open: true, initial: null, device })}
              onEditHost={() => setHostModal({ open: true, initial: host, device })}
              onAddVm={() => setVmModal({ open: true, initial: null, defaultHostId: host?.id })}
              onEditVm={vm => setVmModal({ open: true, initial: vm })}
              onDeleteVm={deleteVm}
              onAddApp={(vmId, hostId) => setAppModal({ open: true, initial: null, defaultVmId: vmId, defaultHostId: hostId })}
              onEditApp={app => setAppModal({ open: true, initial: app })}
              onDeleteApp={deleteApp}
            />
          );
        })}
        {visibleDevices.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: th.fontData, fontSize: 12, color: th.text3,
          }}>
            no devices match the current filter
          </div>
        )}
      </div>

      {/* Modals */}
      <HostEditorModal
        open={hostModal.open}
        initial={hostModal.initial}
        devices={devices}
        th={th}
        accent={accent}
        onSave={saveHost}
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
        onSave={d => saveVm({ ...d, hostId: d.hostId || vmModal.defaultHostId || d.hostId })}
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
        onSave={saveApp}
        onClose={() => setAppModal({ open: false })}
      />
    </div>
  );
}
