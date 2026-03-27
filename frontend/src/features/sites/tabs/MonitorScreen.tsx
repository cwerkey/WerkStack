import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useParams }     from 'react-router-dom';
import { EmptyState }       from '../../../components/ui/EmptyState';
import { ErrorBoundary }    from '../../../components/ui/ErrorBoundary';
import { api }              from '../../../utils/api';
import type { SiteCtx }     from '../../SiteShell';
import type { DeviceEvent } from '@werkstack/shared';

// ── Types ────────────────────────────────────────────────────────────────────

interface DeviceStatusRow {
  deviceId:      string;
  deviceName:    string;
  typeId:        string;
  currentStatus: string;
  lastHeartbeat?: string;
  lastLatency?:  number;
}

// ── Status helpers ───────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'up':          return 'var(--green, #70b870)';
    case 'down':        return 'var(--red, #c07070)';
    case 'degraded':    return 'var(--gold, #b89870)';
    case 'maintenance': return 'var(--blue, #7090b8)';
    default:            return 'var(--text3, #4e5560)';
  }
}

function statusDot(status: string) {
  return (
    <span style={{
      display: 'inline-block',
      width: 8, height: 8, borderRadius: '50%',
      background: statusColor(status),
      flexShrink: 0,
    }} />
  );
}

// ── MonitorScreen ────────────────────────────────────────────────────────────

export function MonitorScreen() {
  const { accent, css } = useOutletContext<SiteCtx>();
  const { siteId }      = useParams<{ siteId: string }>();
  const av = { '--accent': accent } as React.CSSProperties;

  const [devices, setDevices] = useState<DeviceStatusRow[]>([]);
  const [events, setEvents]   = useState<DeviceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string> | null>(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setErr('');
    try {
      const [d, e] = await Promise.all([
        api.get<DeviceStatusRow[]>(`/api/sites/${siteId}/monitor/status`),
        api.get<DeviceEvent[]>(`/api/sites/${siteId}/monitor/events`),
      ]);
      setDevices(d!);
      setEvents(e!);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const statuses = ['up', 'down', 'degraded', 'maintenance', 'unknown'];
  const visible = devices.filter(d => statusFilter === null || statusFilter.has(d.currentStatus));

  // Status summary
  const counts = { up: 0, down: 0, degraded: 0, maintenance: 0, unknown: 0 };
  devices.forEach(d => {
    if (d.currentStatus in counts) counts[d.currentStatus as keyof typeof counts]++;
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
      `}</style>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 40px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13, fontWeight: 700,
            color: 'var(--text, #d4d9dd)',
          }}>
            status monitor
          </span>
          <button className="btn-ghost" onClick={load}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 4 }}>
            refresh
          </button>
        </div>

        {err && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--red, #c07070)', marginBottom: 12,
          }}>{err}</div>
        )}

        {/* Status summary bar */}
        <div style={{
          display: 'flex', gap: 12, marginBottom: 20,
        }}>
          {statuses.map(s => (
            <div key={s} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            }}>
              {statusDot(s)}
              <span style={{ color: 'var(--text, #d4d9dd)', fontWeight: 700 }}>
                {counts[s as keyof typeof counts]}
              </span>
              <span style={{ color: 'var(--text3, #4e5560)', fontSize: 10 }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          <button
            className={`rpill${statusFilter === null ? ' on' : ''}`}
            onClick={() => setStatusFilter(statusFilter === null ? new Set() : null)}
            style={{ fontSize: 10, padding: '2px 8px' }}>
            all
          </button>
          {statuses.map(s => {
            const isOn = statusFilter === null || statusFilter.has(s);
            return (
              <button key={s}
                className={`rpill${isOn && statusFilter !== null ? ' on' : ''}`}
                onClick={() => {
                  if (statusFilter === null) {
                    setStatusFilter(new Set(statuses.filter(x => x !== s)));
                  } else {
                    const next = new Set(statusFilter);
                    if (next.has(s)) next.delete(s); else next.add(s);
                    if (next.size === statuses.length) setStatusFilter(null);
                    else setStatusFilter(next);
                  }
                }}
                style={{ fontSize: 10, padding: '2px 8px' }}>
                {s}
              </button>
            );
          })}
        </div>

        {!loading && devices.length === 0 && (
          <EmptyState icon="zap" title="no active devices to monitor" />
        )}

        {/* Device status table */}
        {visible.length > 0 && (
          <ErrorBoundary>
          <div style={{
            background: 'var(--cardBg, #141618)',
            border: '1px solid var(--border, #1d2022)',
            borderRadius: 8, overflow: 'hidden',
            marginBottom: 24,
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, color: 'var(--text3, #4e5560)',
                  textAlign: 'left',
                }}>
                  <th style={{ padding: '8px 12px', width: 24 }}></th>
                  <th style={{ padding: '8px 12px' }}>device</th>
                  <th style={{ padding: '8px 12px' }}>status</th>
                  <th style={{ padding: '8px 12px' }}>last heartbeat</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>latency</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(d => (
                  <tr key={d.deviceId} style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11, color: 'var(--text, #d4d9dd)',
                    borderTop: '1px solid var(--border, #1d2022)',
                  }}>
                    <td style={{ padding: '6px 12px' }}>{statusDot(d.currentStatus)}</td>
                    <td style={{ padding: '6px 12px' }}>{d.deviceName}</td>
                    <td style={{ padding: '6px 12px', color: statusColor(d.currentStatus) }}>
                      {d.currentStatus}
                    </td>
                    <td style={{ padding: '6px 12px', color: 'var(--text3, #4e5560)' }}>
                      {d.lastHeartbeat
                        ? new Date(d.lastHeartbeat).toLocaleString()
                        : 'never'}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--text3, #4e5560)' }}>
                      {d.lastLatency != null ? `${d.lastLatency}ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </ErrorBoundary>
        )}

        {/* Event log */}
        {events.length > 0 && (
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700,
              color: 'var(--text2, #8a9299)',
              marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              event log
            </div>
            <div style={{
              background: 'var(--cardBg, #141618)',
              border: '1px solid var(--border, #1d2022)',
              borderRadius: 8, padding: 12,
              maxHeight: 300, overflowY: 'auto',
            }}>
              {events.map(ev => (
                <div key={ev.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '3px 0',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--text, #d4d9dd)',
                }}>
                  <span style={{
                    fontSize: 9, padding: '1px 4px', borderRadius: 2,
                    background: ev.eventType.includes('missed') || ev.eventType.includes('abandoned')
                      ? '#c0707020'
                      : ev.eventType.includes('restored') || ev.eventType.includes('promoted')
                      ? '#70b87020' : '#b8987020',
                    color: ev.eventType.includes('missed') || ev.eventType.includes('abandoned')
                      ? 'var(--red, #c07070)'
                      : ev.eventType.includes('restored') || ev.eventType.includes('promoted')
                      ? 'var(--green, #70b870)' : 'var(--gold, #b89870)',
                    whiteSpace: 'nowrap',
                  }}>
                    {ev.eventType}
                  </span>
                  {ev.fromState && (
                    <span style={{ color: 'var(--text3, #4e5560)' }}>
                      {ev.fromState} → {ev.toState}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', color: 'var(--text3, #4e5560)', whiteSpace: 'nowrap' }}>
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
