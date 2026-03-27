import { useState } from 'react';
import type { OsHost, OsVm, OsApp, DeviceInstance, VmType, AppType } from '@werkstack/shared';
import type { OsThemeTokens } from '../../../../store/useThemeStore';

interface Props {
  hosts:    OsHost[];
  vms:      OsVm[];
  apps:     OsApp[];
  devices:  DeviceInstance[];
  vmTypes:  VmType[];
  appTypes: AppType[];
  th:       OsThemeTokens;
  accent:   string;
  onEditHost: (host: OsHost) => void;
  onEditVm:   (vm: OsVm) => void;
  onEditApp:  (app: OsApp) => void;
}

export function OsListView({
  hosts, vms, apps, devices, vmTypes, appTypes, th,
  onEditHost, onEditVm, onEditApp,
}: Props) {
  // Set of expanded node IDs
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(devices.map(d => d.id)));

  const vmTypeMap  = Object.fromEntries(vmTypes.map(t => [t.id, t]));
  const appTypeMap = Object.fromEntries(appTypes.map(t => [t.id, t]));

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const rowBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 0', cursor: 'pointer', userSelect: 'none',
    fontFamily: th.fontData, fontSize: 12,
    borderBottom: `1px solid ${th.border}`,
  };

  const iconStyle = (color: string): React.CSSProperties => ({
    width: 14, height: 14, borderRadius: 2,
    background: color + '30', border: `1px solid ${color}60`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  });

  const chevron = (open: boolean) => (
    <span style={{
      display: 'inline-block', width: 10, color: th.text3,
      fontFamily: 'monospace', fontSize: 10, flexShrink: 0,
    }}>{open ? '▾' : '▸'}</span>
  );

  const emptyChevron = <span style={{ display: 'inline-block', width: 10, flexShrink: 0 }} />;

  const pillStyle = (color: string) => ({
    display: 'inline-block', padding: '0px 5px', borderRadius: 2,
    background: color + '20', color,
    fontFamily: th.fontLabel, fontSize: 9,
    textTransform: 'uppercase' as const,
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
      {devices.map(device => {
        const host     = hosts.find(h => h.deviceId === device.id);
        const isOpen   = expanded.has(device.id);
        const hostVms  = vms.filter(v => v.hostId === host?.id);
        const bareApps = apps.filter(a => a.hostId === host?.id && !a.vmId);
        const hasChildren = !!host && (hostVms.length > 0 || bareApps.length > 0);

        return (
          <div key={device.id}>
            {/* Device row */}
            <div
              style={{
                ...rowBase, paddingLeft: 4,
                background: isOpen ? th.infraBg : 'transparent',
              }}
              onClick={() => hasChildren && toggle(device.id)}
              onDoubleClick={() => host && onEditHost(host)}
            >
              {hasChildren ? chevron(isOpen) : emptyChevron}
              <span style={{
                ...iconStyle(th.hostTint),
                fontSize: 9, color: th.hostTint, lineHeight: 1,
              }}>H</span>
              <span style={{ fontFamily: th.fontMain, fontSize: 12, color: th.text, fontWeight: 600 }}>
                {device.name}
              </span>
              {host ? (
                <span style={{ fontFamily: th.fontData, fontSize: 11, color: th.text2 }}>
                  — {host.hostOs}{host.osVersion ? ` ${host.osVersion}` : ''}
                </span>
              ) : (
                <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}>
                  no host os
                </span>
              )}
              {host && (
                <span
                  style={{
                    marginLeft: 'auto', fontFamily: th.fontLabel, fontSize: 10,
                    color: th.text3, padding: '1px 8px', borderRadius: 3,
                    border: `1px solid ${th.border2}`, cursor: 'pointer',
                  }}
                  onClick={e => { e.stopPropagation(); onEditHost(host); }}
                >edit</span>
              )}
            </div>

            {/* Expanded children */}
            {isOpen && host && (
              <div style={{ paddingLeft: 20 }}>
                {/* VMs */}
                {hostVms.map(vm => {
                  const vmApps   = apps.filter(a => a.vmId === vm.id);
                  const vmOpen   = expanded.has(vm.id);
                  const vmt      = vmTypeMap[vm.typeId];

                  return (
                    <div key={vm.id}>
                      <div
                        style={{
                          ...rowBase, paddingLeft: 4,
                          background: vmOpen ? th.vmTint + '12' : 'transparent',
                        }}
                        onClick={() => vmApps.length > 0 && toggle(vm.id)}
                        onDoubleClick={() => onEditVm(vm)}
                      >
                        {vmApps.length > 0 ? chevron(vmOpen) : emptyChevron}
                        <span style={{
                          ...iconStyle(th.vmTint),
                          fontSize: 9, color: th.vmTint, lineHeight: 1,
                        }}>V</span>
                        <span style={{ color: th.text }}>{vm.name}</span>
                        {vmt && <span style={pillStyle(th.vmTint)}>{vmt.name}</span>}
                        {vm.vmOs && (
                          <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>
                            {vm.vmOs}{vm.osVersion ? ` ${vm.osVersion}` : ''}
                          </span>
                        )}
                        {vm.cpus != null && (
                          <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>
                            {vm.cpus}c / {vm.ramGb ?? '?'}GB
                          </span>
                        )}
                        <span
                          style={{
                            marginLeft: 'auto', fontFamily: th.fontLabel, fontSize: 10,
                            color: th.text3, padding: '1px 8px', borderRadius: 3,
                            border: `1px solid ${th.border2}`, cursor: 'pointer',
                          }}
                          onClick={e => { e.stopPropagation(); onEditVm(vm); }}
                        >edit</span>
                      </div>

                      {/* VM apps */}
                      {vmOpen && (
                        <div style={{ paddingLeft: 20 }}>
                          {vmApps.map(app => {
                            const at = appTypeMap[app.typeId];
                            return (
                              <div
                                key={app.id}
                                style={{ ...rowBase, paddingLeft: 4 }}
                                onDoubleClick={() => onEditApp(app)}
                              >
                                {emptyChevron}
                                <span style={{
                                  ...iconStyle(th.appTint),
                                  fontSize: 9, color: th.appTint, lineHeight: 1,
                                }}>A</span>
                                <span style={{ color: th.text }}>{app.name}</span>
                                {at && <span style={pillStyle(th.appTint)}>{at.name}</span>}
                                {app.version && (
                                  <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>
                                    v{app.version}
                                  </span>
                                )}
                                {app.ip && (
                                  <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>
                                    {app.ip}
                                  </span>
                                )}
                                <span
                                  style={{
                                    marginLeft: 'auto', fontFamily: th.fontLabel, fontSize: 10,
                                    color: th.text3, padding: '1px 8px', borderRadius: 3,
                                    border: `1px solid ${th.border2}`, cursor: 'pointer',
                                  }}
                                  onClick={e => { e.stopPropagation(); onEditApp(app); }}
                                >edit</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Bare metal apps */}
                {bareApps.map(app => {
                  const at = appTypeMap[app.typeId];
                  return (
                    <div
                      key={app.id}
                      style={{ ...rowBase, paddingLeft: 4 }}
                      onDoubleClick={() => onEditApp(app)}
                    >
                      {emptyChevron}
                      <span style={{
                        ...iconStyle(th.appTint),
                        fontSize: 9, color: th.appTint, lineHeight: 1,
                      }}>A</span>
                      <span style={{ color: th.text }}>{app.name}</span>
                      {at && <span style={pillStyle(th.appTint)}>{at.name}</span>}
                      <span style={{ fontFamily: th.fontLabel, fontSize: 9, color: th.text3 }}>
                        bare metal
                      </span>
                      {app.version && (
                        <span style={{ fontFamily: th.fontData, fontSize: 10, color: th.text3 }}>
                          v{app.version}
                        </span>
                      )}
                      <span
                        style={{
                          marginLeft: 'auto', fontFamily: th.fontLabel, fontSize: 10,
                          color: th.text3, padding: '1px 8px', borderRadius: 3,
                          border: `1px solid ${th.border2}`, cursor: 'pointer',
                        }}
                        onClick={e => { e.stopPropagation(); onEditApp(app); }}
                      >edit</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {devices.length === 0 && (
        <div style={{
          padding: 32, textAlign: 'center',
          fontFamily: th.fontData, fontSize: 12, color: th.text3,
        }}>
          no devices in this site
        </div>
      )}

      <div style={{ height: 8 }} />
      <div style={{ fontFamily: th.fontLabel, fontSize: 9, color: th.text3, textAlign: 'center', marginTop: 8 }}>
        double-click any row to edit
      </div>
    </div>
  );

}
