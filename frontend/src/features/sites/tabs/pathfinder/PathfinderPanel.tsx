import { useState, useCallback } from 'react';
import { useParams }          from 'react-router-dom';
import { useRackStore }       from '../../../../store/useRackStore';
import { api }                from '../../../../utils/api';
import type { PathResult, DeviceInstance, VpnTunnel } from '@werkstack/shared';

// ── Props ────────────────────────────────────────────────────────────────────

interface PathfinderPanelProps {
  accent:  string;
  onClose: () => void;
}

// ── PathfinderPanel ──────────────────────────────────────────────────────────

export function PathfinderPanel({ accent, onClose }: PathfinderPanelProps) {
  const { siteId } = useParams<{ siteId: string }>();
  const devices    = useRackStore(s => s.devices);

  const [srcId, setSrcId]     = useState('');
  const [dstId, setDstId]     = useState('');
  const [layer, setLayer]     = useState<'L1' | 'L3' | 'all'>('all');
  const [maxDepth, setMaxDepth] = useState(15);
  const [result, setResult]   = useState<PathResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  // Tunnels management
  const [tunnels, setTunnels]     = useState<VpnTunnel[]>([]);
  const [showTunnels, setShowTunnels] = useState(false);

  const activeDevices = devices.filter(d => !d.isDraft);

  const trace = useCallback(async () => {
    if (!siteId || !srcId || !dstId) return;
    setLoading(true);
    setErr('');
    setResult(null);
    try {
      const r = await api.post<PathResult>(`/api/sites/${siteId}/pathfinder/trace`, {
        srcDeviceId: srcId,
        dstDeviceId: dstId,
        layer,
        maxDepth,
      });
      setResult(r!);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'trace failed');
    } finally {
      setLoading(false);
    }
  }, [siteId, srcId, dstId, layer, maxDepth]);

  const loadTunnels = useCallback(async () => {
    if (!siteId) return;
    try {
      const t = await api.get<VpnTunnel[]>(`/api/sites/${siteId}/pathfinder/tunnels`);
      setTunnels(t!);
    } catch { /* non-fatal */ }
  }, [siteId]);

  return (
    <div style={{
      background:   'var(--cardBg, #141618)',
      border:       '1px solid var(--border, #1d2022)',
      borderRadius: 8,
      padding:      16,
      display:      'flex',
      flexDirection: 'column',
      gap:          12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13, fontWeight: 700,
          color: 'var(--text, #d4d9dd)',
        }}>
          pathfinder
        </span>
        <button className="btn-ghost" onClick={onClose}
          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
          close
        </button>
      </div>

      {/* Source / Destination selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
            source
          </span>
          <select value={srcId} onChange={e => setSrcId(e.target.value)}
            style={{
              background: 'var(--inputBg, #1a1d20)', border: '1px solid var(--border2, #262c30)',
              borderRadius: 4, padding: '5px 10px', color: 'var(--text, #d4d9dd)',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            }}>
            <option value="">— select —</option>
            {activeDevices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
            destination
          </span>
          <select value={dstId} onChange={e => setDstId(e.target.value)}
            style={{
              background: 'var(--inputBg, #1a1d20)', border: '1px solid var(--border2, #262c30)',
              borderRadius: 4, padding: '5px 10px', color: 'var(--text, #d4d9dd)',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            }}>
            <option value="">— select —</option>
            {activeDevices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Options row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
          layer:
        </span>
        {(['all', 'L1', 'L3'] as const).map(l => (
          <button key={l}
            className={`rpill${layer === l ? ' on' : ''}`}
            onClick={() => setLayer(l)}
            style={{ fontSize: 10, padding: '2px 8px' }}>
            {l}
          </button>
        ))}

        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)', marginLeft: 8 }}>
          depth:
        </span>
        <input type="number" min={1} max={15} value={maxDepth}
          onChange={e => setMaxDepth(Math.min(15, Math.max(1, parseInt(e.target.value) || 1)))}
          style={{
            width: 40, background: 'var(--inputBg, #1a1d20)',
            border: '1px solid var(--border2, #262c30)', borderRadius: 4,
            padding: '2px 6px', color: 'var(--text, #d4d9dd)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          }}
        />
      </div>

      {/* Trace button */}
      <button className="act-primary" onClick={trace}
        disabled={!srcId || !dstId || loading}
        style={{
          background: accent, border: 'none', borderRadius: 4,
          padding: '6px 14px', color: '#fff',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          fontWeight: 700, cursor: 'pointer', opacity: (!srcId || !dstId) ? 0.5 : 1,
        }}>
        {loading ? 'tracing...' : 'trace path'}
      </button>

      {/* Error */}
      {err && (
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--red, #c07070)' }}>
          {err}
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{
          background:   'var(--cardBg2, #0c0d0e)',
          border:       '1px solid var(--border, #1d2022)',
          borderRadius: 6,
          padding:      12,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--text, #d4d9dd)',
            marginBottom: 8,
          }}>
            {result.found ? (
              <span style={{ color: 'var(--green, #70b870)' }}>
                path found ({result.depth} hops)
              </span>
            ) : (
              <span style={{ color: 'var(--red, #c07070)' }}>
                no path found
              </span>
            )}
            {result.hasCycle && (
              <span style={{ color: 'var(--gold, #b89870)', marginLeft: 8 }}>
                cycle detected
              </span>
            )}
          </div>

          {result.found && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Source */}
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, color: accent,
                padding: '4px 8px', background: 'var(--inputBg, #1a1d20)',
                borderRadius: 4,
              }}>
                {result.source}
              </div>

              {result.path.map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 1, height: 16, background: 'var(--border2, #262c30)',
                    marginLeft: 12,
                  }} />
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, color: 'var(--text3, #4e5560)',
                    padding: '1px 4px',
                    background: step.linkType === 'L3' ? '#7090b820' : 'transparent',
                    borderRadius: 2,
                  }}>
                    {step.linkType}{step.linkLabel ? ` (${step.linkLabel})` : ''}
                  </span>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: step.isBridge ? 'var(--gold, #b89870)' : 'var(--text, #d4d9dd)',
                    padding: '4px 8px',
                    background: 'var(--inputBg, #1a1d20)',
                    borderRadius: 4,
                    flex: 1,
                  }}>
                    {step.deviceName}
                    {step.isBridge && <span style={{ fontSize: 8, marginLeft: 4 }}>(bridge)</span>}
                    {step.port && <span style={{ color: 'var(--text3, #4e5560)', marginLeft: 4 }}>:{step.port}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tunnel management toggle */}
      <button className="btn-ghost" onClick={() => { setShowTunnels(!showTunnels); if (!showTunnels) loadTunnels(); }}
        style={{ fontSize: 10, padding: '4px 10px', borderRadius: 4, alignSelf: 'flex-start' }}>
        {showTunnels ? 'hide tunnels' : 'manage vpn tunnels'}
      </button>

      {showTunnels && (
        <TunnelManager
          siteId={siteId!}
          tunnels={tunnels}
          devices={activeDevices}
          onRefresh={loadTunnels}
        />
      )}
    </div>
  );
}

// ── Tunnel Manager sub-component ─────────────────────────────────────────────

interface TunnelManagerProps {
  siteId:    string;
  tunnels:   VpnTunnel[];
  devices:   DeviceInstance[];
  onRefresh: () => void;
}

function TunnelManager({ siteId, tunnels, devices, onRefresh }: TunnelManagerProps) {
  const [srcId, setSrcId]   = useState('');
  const [dstId, setDstId]   = useState('');
  const [type, setType]     = useState<string>('vpn');
  const [label, setLabel]   = useState('');

  const add = async () => {
    if (!srcId || !dstId) return;
    try {
      await api.post(`/api/sites/${siteId}/pathfinder/tunnels`, {
        srcDeviceId: srcId, dstDeviceId: dstId,
        tunnelType: type, label: label || undefined,
      });
      setSrcId(''); setDstId(''); setLabel('');
      onRefresh();
    } catch { /* handled by API */ }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/api/sites/${siteId}/pathfinder/tunnels/${id}`);
      onRefresh();
    } catch { /* handled by API */ }
  };

  const deviceName = (id: string) => devices.find(d => d.id === id)?.name ?? id.slice(0, 8);

  return (
    <div style={{
      background: 'var(--cardBg2, #0c0d0e)',
      border: '1px solid var(--border, #1d2022)',
      borderRadius: 6, padding: 10,
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 700,
        color: 'var(--text2, #8a9299)', marginBottom: 8,
      }}>
        vpn tunnels ({tunnels.length})
      </div>

      {/* Existing tunnels */}
      {tunnels.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 0',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: 'var(--text, #d4d9dd)',
        }}>
          <span>{deviceName(t.srcDeviceId)}</span>
          <span style={{ color: 'var(--text3, #4e5560)' }}>→</span>
          <span>{deviceName(t.dstDeviceId)}</span>
          <span style={{ color: 'var(--blue, #7090b8)', fontSize: 9 }}>{t.tunnelType}</span>
          {t.label && <span style={{ color: 'var(--text3, #4e5560)' }}>({t.label})</span>}
          <button className="btn-ghost" onClick={() => remove(t.id)}
            style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 3 }}>
            ×
          </button>
        </div>
      ))}

      {/* Add tunnel form */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        <select value={srcId} onChange={e => setSrcId(e.target.value)}
          style={{
            flex: 1, minWidth: 80, background: 'var(--inputBg, #1a1d20)',
            border: '1px solid var(--border2, #262c30)', borderRadius: 3,
            padding: '3px 6px', color: 'var(--text, #d4d9dd)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          }}>
          <option value="">src</option>
          {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={dstId} onChange={e => setDstId(e.target.value)}
          style={{
            flex: 1, minWidth: 80, background: 'var(--inputBg, #1a1d20)',
            border: '1px solid var(--border2, #262c30)', borderRadius: 3,
            padding: '3px 6px', color: 'var(--text, #d4d9dd)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          }}>
          <option value="">dst</option>
          {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)}
          style={{
            width: 80, background: 'var(--inputBg, #1a1d20)',
            border: '1px solid var(--border2, #262c30)', borderRadius: 3,
            padding: '3px 6px', color: 'var(--text, #d4d9dd)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          }}>
          {['vpn', 'vxlan', 'gre', 'ipsec', 'wireguard'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button className="act-primary" onClick={add}
          disabled={!srcId || !dstId}
          style={{
            background: 'var(--accent, #c47c5a)', border: 'none', borderRadius: 3,
            padding: '3px 8px', color: '#fff',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            cursor: 'pointer', opacity: (!srcId || !dstId) ? 0.5 : 1,
          }}>
          add
        </button>
      </div>
    </div>
  );
}
