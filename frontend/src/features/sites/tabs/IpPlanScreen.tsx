import { useState, useEffect } from 'react';
import { useOutletContext }  from 'react-router-dom';
import { useRackStore }      from '../../../store/useRackStore';
import { useThemeStore, OS_THEME_TOKENS, themeToVars } from '../../../store/useThemeStore';
import { api }               from '../../../utils/api';
import { EmptyState }        from '../../../components/ui/EmptyState';
import type { SiteCtx }      from '../../SiteShell';
import type { Subnet, IpAssignment } from '@werkstack/shared';
import { SubnetModal }       from './ip_plan/SubnetModal';
import { IpAssignModal }     from './ip_plan/IpAssignModal';

export function IpPlanScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;

  const osTheme = useThemeStore(s => s.osTheme);
  const th      = OS_THEME_TOKENS[osTheme];
  const thVars  = themeToVars(th) as React.CSSProperties;

  const devices = useRackStore(s => s.devices);

  const [subnets,  setSubnets]  = useState<Subnet[]>([]);
  const [ips,      setIps]      = useState<Record<string, IpAssignment[]>>({});
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [subnetModal, setSubnetModal] = useState<{ open: boolean; initial?: Subnet | null }>({ open: false });
  const [ipModal, setIpModal] = useState<{ open: boolean; subnet?: Subnet; initial?: IpAssignment | null }>({ open: false });
  const [deleting, setDeleting] = useState<{ type: 'subnet' | 'ip'; id: string } | null>(null);

  const siteId  = site?.id ?? '';
  const apiBase = `/api/sites/${siteId}`;

  useEffect(() => {
    if (!site) return;
    setLoading(true);
    api.get<Subnet[]>(`${apiBase}/subnets`)
      .then(data => setSubnets(data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [site?.id]);

  async function loadIpsForSubnet(subnetId: string) {
    try {
      const data = await api.get<IpAssignment[]>(`${apiBase}/subnets/${subnetId}/ips`);
      setIps(p => ({ ...p, [subnetId]: data ?? [] }));
    } catch (err) {
      console.error(err);
    }
  }

  function toggleExpand(subnetId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(subnetId)) {
        next.delete(subnetId);
      } else {
        next.add(subnetId);
        if (!ips[subnetId]) loadIpsForSubnet(subnetId);
      }
      return next;
    });
  }

  async function deleteSubnet(id: string) {
    setDeleting({ type: 'subnet', id });
    try {
      await api.delete(`${apiBase}/subnets/${id}`);
      setSubnets(p => p.filter(s => s.id !== id));
      setIps(p => { const next = { ...p }; delete next[id]; return next; });
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  }

  async function deleteIp(subnetId: string, ipId: string) {
    setDeleting({ type: 'ip', id: ipId });
    try {
      await api.delete(`${apiBase}/subnets/${subnetId}/ips/${ipId}`);
      setIps(p => ({ ...p, [subnetId]: (p[subnetId] ?? []).filter(x => x.id !== ipId) }));
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  }

  function handleSubnetSave(s: Subnet) {
    setSubnets(p => {
      const idx = p.findIndex(x => x.id === s.id);
      if (idx >= 0) { const n = [...p]; n[idx] = s; return n; }
      return [...p, s];
    });
  }

  function handleIpSave(ip: IpAssignment) {
    setIps(p => {
      const list = p[ip.subnetId] ?? [];
      const idx  = list.findIndex(x => x.id === ip.id);
      if (idx >= 0) {
        const n = [...list]; n[idx] = ip;
        return { ...p, [ip.subnetId]: n };
      }
      return { ...p, [ip.subnetId]: [...list, ip] };
    });
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      ...av, ...(css.vars as React.CSSProperties), ...thVars,
      background: th.pageBg, color: th.text,
    }}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .ip-row:hover td { background: ${th.rowBg} !important; }
        .sn-row:hover { background: ${th.rowBg} !important; }
        .ip-act:hover { color: ${th.text} !important; }
        .ip-del:hover { color: ${th.red} !important; }
        .wiz-input:focus { border-color: var(--accent, #c47c5a) !important; outline: none; }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', height: 38, flexShrink: 0,
        background: th.hdrBg, borderBottom: `1px solid ${th.hdrBorder}`,
      }}>
        <span style={{ fontFamily: th.fontMain, fontSize: 12, color: th.text, marginRight: 4 }}>
          ip_plan
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="act-primary"
          style={{
            padding: '4px 12px', borderRadius: 4,
            background: accent, color: '#0c0d0e',
            fontFamily: th.fontLabel, fontSize: 11,
            border: `1px solid ${accent}`,
          }}
          onClick={() => setSubnetModal({ open: true })}
        >+ new subnet</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ padding: 32, fontFamily: th.fontData, fontSize: 11, color: th.text3 }}>loading…</div>
        ) : subnets.length === 0 ? (
          <EmptyState
            icon="layers"
            title="no subnets yet"
            subtitle="Define subnets to track IP assignments"
            action={
              <button
                className="act-primary"
                style={{ padding: '5px 14px', borderRadius: 4, background: accent, color: '#0c0d0e', border: `1px solid ${accent}`, fontFamily: th.fontLabel, fontSize: 11 }}
                onClick={() => setSubnetModal({ open: true })}
              >+ new subnet</button>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {subnets.map(subnet => {
              const isExpanded  = expanded.has(subnet.id);
              const subnetIps   = ips[subnet.id] ?? [];
              const isDeleting  = deleting?.type === 'subnet' && deleting.id === subnet.id;
              return (
                <div
                  key={subnet.id}
                  style={{
                    border: `1px solid ${th.border2}`, borderRadius: 6,
                    background: th.cardBg, overflow: 'hidden',
                  }}
                >
                  {/* Subnet header row */}
                  <div
                    className="sn-row"
                    style={{
                      display: 'flex', alignItems: 'center', padding: '8px 12px',
                      cursor: 'pointer', gap: 10,
                    }}
                    onClick={() => toggleExpand(subnet.id)}
                  >
                    <span style={{ fontFamily: th.fontData, fontSize: 11, color: th.text3, width: 14 }}>
                      {isExpanded ? '▾' : '▸'}
                    </span>

                    {/* Color accent bar */}
                    <div style={{ width: 3, height: 28, borderRadius: 2, background: accent, flexShrink: 0 }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: th.fontMain, fontSize: 12, color: th.text }}>
                        {subnet.name}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: th.fontData, fontSize: 11, color: accent }}>
                          {subnet.cidr}
                        </span>
                        {subnet.vlan && (
                          <span style={{
                            fontFamily: th.fontLabel, fontSize: 10, color: '#0c0d0e',
                            background: th.border3, padding: '1px 6px', borderRadius: 3,
                          }}>VLAN {subnet.vlan}</span>
                        )}
                        {subnet.gateway && (
                          <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}>
                            gw: {subnet.gateway}
                          </span>
                        )}
                        {ips[subnet.id] !== undefined && (
                          <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}>
                            {subnetIps.length} IP{subnetIps.length !== 1 ? 's' : ''} assigned
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button
                        className="ip-act"
                        style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}
                        onClick={() => setSubnetModal({ open: true, initial: subnet })}
                      >edit</button>
                      <button
                        className="ip-del"
                        disabled={isDeleting}
                        style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}
                        onClick={() => deleteSubnet(subnet.id)}
                      >{isDeleting ? '…' : 'delete'}</button>
                    </div>
                  </div>

                  {/* Expanded: IP table */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${th.border}` }}>
                      {/* IP table header */}
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        padding: '6px 12px 4px 40px',
                        borderBottom: `1px solid ${th.border}`,
                        background: th.rowBg,
                      }}>
                        <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, flex: 1 }}>
                          IP assignments — {subnetIps.length} assigned
                        </span>
                        <button
                          className="act-primary"
                          style={{
                            padding: '3px 10px', borderRadius: 3,
                            background: accent, color: '#0c0d0e',
                            fontFamily: th.fontLabel, fontSize: 10,
                            border: `1px solid ${accent}`,
                          }}
                          onClick={e => { e.stopPropagation(); setIpModal({ open: true, subnet }); }}
                        >+ assign IP</button>
                      </div>

                      {subnetIps.length === 0 ? (
                        <div style={{
                          padding: '14px 40px', fontFamily: th.fontLabel,
                          fontSize: 11, color: th.text3,
                        }}>no IPs assigned yet</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: th.fontData, fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${th.border}` }}>
                              {['IP', 'device', 'label', ''].map((h, i) => (
                                <th key={i} style={{
                                  padding: '5px 10px 5px ' + (i === 0 ? '40px' : '10px'),
                                  textAlign: 'left',
                                  fontFamily: th.fontLabel, fontSize: 10, color: th.text3,
                                  fontWeight: 500,
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {subnetIps.map(ipRow => {
                              const dev    = devices.find(d => d.id === ipRow.deviceId);
                              const isDel  = deleting?.type === 'ip' && deleting.id === ipRow.id;
                              return (
                                <tr key={ipRow.id} className="ip-row">
                                  <td style={{ padding: '6px 10px 6px 40px', color: accent, fontFamily: th.fontData }}>
                                    {ipRow.ip}
                                  </td>
                                  <td style={{ padding: '6px 10px', color: th.text2 }}>
                                    {dev?.name ?? (ipRow.deviceId ? 'deleted device' : <span style={{ color: th.text3 }}>reserved</span>)}
                                  </td>
                                  <td style={{ padding: '6px 10px', color: th.text3 }}>
                                    {ipRow.label ?? ''}
                                  </td>
                                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                    <button
                                      className="ip-act"
                                      style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginRight: 8 }}
                                      onClick={() => setIpModal({ open: true, subnet, initial: ipRow })}
                                    >edit</button>
                                    <button
                                      className="ip-del"
                                      disabled={isDel}
                                      style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}
                                      onClick={() => deleteIp(subnet.id, ipRow.id)}
                                    >{isDel ? '…' : 'delete'}</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats footer */}
      {subnets.length > 0 && (
        <div style={{
          padding: '5px 16px', borderTop: `1px solid ${th.border}`,
          fontFamily: th.fontLabel, fontSize: 10, color: th.text3,
          display: 'flex', gap: 16,
        }}>
          <span>{subnets.length} subnet{subnets.length !== 1 ? 's' : ''}</span>
          <span>
            {Object.values(ips).reduce((sum, arr) => sum + arr.length, 0)} IPs assigned
          </span>
        </div>
      )}

      <SubnetModal
        open={subnetModal.open}
        initial={subnetModal.initial}
        siteId={siteId}
        onSave={handleSubnetSave}
        onClose={() => setSubnetModal({ open: false })}
      />

      {ipModal.open && ipModal.subnet && (
        <IpAssignModal
          open={ipModal.open}
          siteId={siteId}
          subnet={ipModal.subnet}
          initial={ipModal.initial}
          onSave={handleIpSave}
          onClose={() => setIpModal({ open: false })}
        />
      )}
    </div>
  );
}
